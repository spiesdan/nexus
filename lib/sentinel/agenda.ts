/**
 * Agenda do Sentinel — quais organizações o cron deve varrer nesta rodada.
 *
 * O cron roda a cada 15 minutos, mas a cadência por organização é configurável
 * (default 6h). A pergunta aqui é só "está devida?"; o kill switch é decidido
 * antes (ambiente) e dentro de `executarSentinela` (organização).
 *
 * Organização SUSPENSA não entra na fila de detecção: ela não produz trabalho
 * novo e não pode consumir as vagas do tick (o teto de 3 existe para proteger
 * o timeout). Ela sai numa lista separada, `suspensas`, e o cron ainda passa
 * por ela para registrar a rodada e encerrar as ocorrências abertas com motivo
 * declarado — sem coletar snapshot nenhum.
 */
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { interpretarConfiguracao, organizacaoDevida } from "./config";

export interface OrganizacaoDevida {
  organizationId: string;
  intervaloMinutos: number;
}

export interface AgendaSentinel {
  /** Organizações ativas e devidas — entram na detecção. */
  devidas: OrganizacaoDevida[];
  /** Organizações suspensas e devidas — só registro da rodada e fechamento. */
  suspensas: OrganizacaoDevida[];
}

/**
 * `limite` protege a invocação do cron: uma instalação com muitas organizações
 * drena ao longo dos ticks em vez de estourar o timeout do scheduler. O mesmo
 * teto vale para as suspensas, que são baratas mas ainda escrevem uma rodada.
 */
export async function organizacoesDevidas(
  agoraMs = Date.now(),
  limite = 3,
): Promise<AgendaSentinel> {
  const admin = createAdminClient();

  const [{ data: orgs, error: erroOrgs }, { data: settings, error: erroSettings }] =
    await Promise.all([
      admin
        .from("organizations")
        .select("id, suspended_at")
        .order("id", { ascending: true })
        .limit(500),
      admin
        .from("sentinel_settings")
        .select(
          "organization_id, ativo, intervalo_minutos, retencao_dias, limite_ocorrencias, detectores_desativados, ultima_execucao_em",
        )
        .limit(500),
    ]);

  if (erroOrgs) {
    logger.error("sentinel.due_orgs_failed", { erro: erroOrgs.message });
    return { devidas: [], suspensas: [] };
  }
  if (erroSettings) {
    logger.warn("sentinel.due_settings_failed", { erro: erroSettings.message });
  }

  const porOrg = new Map<string, Parameters<typeof interpretarConfiguracao>[0]>();
  for (const linha of (settings ?? []) as Array<{ organization_id: string }>) {
    porOrg.set(linha.organization_id, linha as Parameters<typeof interpretarConfiguracao>[0]);
  }

  const agenda: AgendaSentinel = { devidas: [], suspensas: [] };
  for (const org of (orgs ?? []) as Array<{ id: string; suspended_at: string | null }>) {
    const config = interpretarConfiguracao(porOrg.get(org.id) ?? null);
    if (!config.ativo) continue;
    if (!organizacaoDevida(config.ultimaExecucaoEm, config.intervaloMinutos, agoraMs)) continue;

    const item = { organizationId: org.id, intervaloMinutos: config.intervaloMinutos };
    if (org.suspended_at !== null) {
      if (agenda.suspensas.length < limite) agenda.suspensas.push(item);
    } else if (agenda.devidas.length < limite) {
      agenda.devidas.push(item);
    }
    if (agenda.devidas.length >= limite && agenda.suspensas.length >= limite) break;
  }

  return agenda;
}
