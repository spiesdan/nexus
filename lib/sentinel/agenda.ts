/**
 * Agenda do Sentinel — quais organizações o cron deve varrer nesta rodada.
 *
 * O cron roda a cada 15 minutos, mas a cadência por organização é configurável
 * (default 6h). A pergunta aqui é só "está devida?"; o kill switch é decidido
 * antes (ambiente) e dentro de `executarSentinela` (organização).
 */
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { interpretarConfiguracao, organizacaoDevida } from "./config";

export interface OrganizacaoDevida {
  organizationId: string;
  intervaloMinutos: number;
}

/**
 * `limite` protege a invocação do cron: uma instalação com muitas organizações
 * drena ao longo dos ticks em vez de estourar o timeout do scheduler.
 */
export async function organizacoesDevidas(
  agoraMs = Date.now(),
  limite = 3,
): Promise<OrganizacaoDevida[]> {
  const admin = createAdminClient();

  const [{ data: orgs, error: erroOrgs }, { data: settings, error: erroSettings }] =
    await Promise.all([
      admin.from("organizations").select("id").order("id", { ascending: true }).limit(500),
      admin
        .from("sentinel_settings")
        .select(
          "organization_id, ativo, intervalo_minutos, retencao_dias, limite_ocorrencias, detectores_desativados, ultima_execucao_em",
        )
        .limit(500),
    ]);

  if (erroOrgs) {
    logger.error("sentinel.due_orgs_failed", { erro: erroOrgs.message });
    return [];
  }
  if (erroSettings) {
    logger.warn("sentinel.due_settings_failed", { erro: erroSettings.message });
  }

  const porOrg = new Map<string, Parameters<typeof interpretarConfiguracao>[0]>();
  for (const linha of (settings ?? []) as Array<{ organization_id: string }>) {
    porOrg.set(linha.organization_id, linha as Parameters<typeof interpretarConfiguracao>[0]);
  }

  const devidas: OrganizacaoDevida[] = [];
  for (const org of (orgs ?? []) as Array<{ id: string }>) {
    const config = interpretarConfiguracao(porOrg.get(org.id) ?? null);
    if (!config.ativo) continue;
    if (!organizacaoDevida(config.ultimaExecucaoEm, config.intervaloMinutos, agoraMs)) continue;
    devidas.push({ organizationId: org.id, intervaloMinutos: config.intervaloMinutos });
    if (devidas.length >= limite) break;
  }

  return devidas;
}
