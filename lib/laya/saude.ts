/**
 * SAÚDE DO MOTOR DE DECISÃO (laya) — o que a tela precisa saber para não
 * confundir "o motor não respondeu" com "não há nada a sugerir".
 *
 * O problema real que isto resolve (20/11/2026): a instalação tinha
 * `LAYA_URL` e `LAYA_API_KEY` definidos e **nenhum serviço** escutando. Os
 * crons tentavam a cada 15 min, o `fetch` falhava, o log dizia
 * "motor indisponível" — e o Radar/Prospecção mostravam ausência de sugestão
 * como se fosse ausência de trabalho. O operador não tinha onde ver a diferença.
 *
 * ─── Por que `incidents` e não uma tabela nova ──────────────────────────────
 *
 * A tabela `incidents` já existe, é genérica (`type`, `payload`, `status`,
 * timestamps) e já é lida pela administração da plataforma. Escrever nela é
 * registrar um fato operacional, não inventar métrica: o estado é lido de
 * volta, não recalculado. Uma tabela dedicada só para isto criaria mais uma
 * série para manter e mais uma tela para ler.
 *
 * ─── O contrato ─────────────────────────────────────────────────────────────
 *
 * - `registrarFalhaDoMotor` é chamada quando o fetch falha. Mantém **UM**
 *   incidente aberto por organização+tipo, incrementando `payload.falhas` — sem
 *   isso seriam 96 incidentes por dia e a tela mostraria ruído em vez de estado.
 * - `registrarSucessoDoMotor` fecha o incidente aberto. "Disponível" volta a
 *   ser silencioso sozinho, sem ninguém clicar em nada.
 * - `lerSaudeDoMotor` nunca lança: falha de leitura vira `sem_registro`, e a
 *   tela não inventa um alarme que não conseguiu provar.
 *
 * Nenhuma destas funções desliga o motor, tenta de novo ou muda o
 * comportamento do cron. Só tornam visível o que já acontece.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

/** O `type` do incidente. Um por motor, não um por chamada. */
export const TIPO_INCIDENTE_MOTOR = "laya.motor_indisponivel";

export type EstadoDoMotor = "ok" | "indisponivel" | "sem_registro";

export interface SaudeDoMotor {
  estado: EstadoDoMotor;
  /** ISO da última falha registrada — `null` se nunca falhou. */
  ultima_falha: string | null;
  /** Mensagem técnica da última falha (ex.: `fetch failed`). */
  detalhe: string | null;
  /** Quantas falhas seguidas foram contadas no incidente aberto. */
  falhas: number | null;
}

interface IncidenteDoMotor {
  status: string;
  payload: Record<string, unknown> | null;
  updated_at: string;
}

/** Payload gravado no incidente — números e texto técnico, nunca segredo. */
interface PayloadDoMotor {
  origem?: string;
  erro?: string;
  falhas?: number;
  primeira_em?: string;
}

const VAZIO: SaudeDoMotor = {
  estado: "sem_registro",
  ultima_falha: null,
  detalhe: null,
  falhas: null,
};

/**
 * Marca o motor como indisponível para a organização.
 *
 * Nunca lança: o cron que chama isto já está no caminho de falha do `fetch`, e
 * uma exceção aqui trocaria "sem sugestão" por "rodada morta".
 */
export async function registrarFalhaDoMotor(
  admin: SupabaseClient,
  organizationId: string,
  origem: "radar" | "prospeccao",
  detalhe: string,
): Promise<void> {
  try {
    const agora = new Date().toISOString();
    const { data: aberto, error: erroLeitura } = await admin
      .from("incidents")
      .select("id, payload")
      .eq("organization_id", organizationId)
      .eq("type", TIPO_INCIDENTE_MOTOR)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroLeitura) {
      logger.warn("[motor] não consegui ler o incidente aberto", {
        organizationId,
        erro: erroLeitura.message,
      });
      return;
    }

    if (aberto) {
      const payload = ((aberto as { payload?: PayloadDoMotor | null }).payload ?? {}) as PayloadDoMotor;
      const { error } = await admin
        .from("incidents")
        .update({
          payload: {
            ...payload,
            origem,
            erro: detalhe,
            falhas: (payload.falhas ?? 1) + 1,
          },
          updated_at: agora,
        })
        .eq("id", (aberto as { id: string }).id);
      if (error) {
        logger.warn("[motor] não consegui atualizar o incidente", {
          organizationId,
          erro: error.message,
        });
      }
      return;
    }

    const { error } = await admin.from("incidents").insert({
      organization_id: organizationId,
      type: TIPO_INCIDENTE_MOTOR,
      severity: "warning",
      status: "open",
      payload: {
        origem,
        erro: detalhe,
        falhas: 1,
        primeira_em: agora,
      } satisfies PayloadDoMotor,
    });
    if (error) {
      logger.warn("[motor] não consegui abrir o incidente", {
        organizationId,
        erro: error.message,
      });
    }
  } catch (e) {
    logger.warn("[motor] registro de falha não concluído", {
      organizationId,
      erro: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * O motor respondeu: fecha o incidente aberto.
 *
 * `eq("status", "open")` faz o custo ser uma linha zero na maioria das rodadas
 * (quando não há incidente) — não precisa de SELECT antes.
 */
export async function registrarSucessoDoMotor(
  admin: SupabaseClient,
  organizationId: string,
): Promise<void> {
  try {
    const { error } = await admin
      .from("incidents")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolution_note: "motor de decisão voltou a responder",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("type", TIPO_INCIDENTE_MOTOR)
      .eq("status", "open");
    if (error) {
      logger.warn("[motor] não consegui fechar o incidente", {
        organizationId,
        erro: error.message,
      });
    }
  } catch (e) {
    logger.warn("[motor] fechamento do incidente não concluído", {
      organizationId,
      erro: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Lê o estado do motor de UMA organização. Nunca lança. */
export async function lerSaudeDoMotor(
  admin: SupabaseClient,
  organizationId: string,
): Promise<SaudeDoMotor> {
  try {
    const { data, error } = await admin
      .from("incidents")
      .select("status, payload, updated_at")
      .eq("organization_id", organizationId)
      .eq("type", TIPO_INCIDENTE_MOTOR)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error) {
      logger.warn("[motor] leitura de saúde falhou", {
        organizationId,
        erro: error.message,
      });
      return VAZIO;
    }
    return interpreta((data ?? []) as IncidenteDoMotor[]);
  } catch (e) {
    logger.warn("[motor] leitura de saúde não concluída", {
      organizationId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return VAZIO;
  }
}

function interpreta(linhas: IncidenteDoMotor[]): SaudeDoMotor {
  if (linhas.length === 0) return VAZIO;
  const aberto = linhas.find((l) => l.status === "open") ?? null;
  const ultima = linhas[0]!;
  const payload = (ultima.payload ?? {}) as PayloadDoMotor;
  return {
    estado: aberto ? "indisponivel" : "ok",
    ultima_falha: ultima.updated_at,
    detalhe: typeof payload.erro === "string" ? payload.erro : null,
    falhas: aberto && typeof payload.falhas === "number" ? payload.falhas : null,
  };
}

/** Estado agregado da instalação — o que `/admin/observabilidade` mostra. */
export interface SaudeDaInstalacao extends SaudeDoMotor {
  organizacoes_com_falha: number;
}

export async function lerSaudeDaInstalacao(
  admin: SupabaseClient,
): Promise<SaudeDaInstalacao> {
  try {
    const { data, error } = await admin
      .from("incidents")
      .select("organization_id, status, payload, updated_at")
      .eq("type", TIPO_INCIDENTE_MOTOR)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) {
      logger.warn("[motor] leitura de saúde da instalação falhou", { erro: error.message });
      return { ...VAZIO, organizacoes_com_falha: 0 };
    }
    const linhas = (data ?? []) as Array<IncidenteDoMotor & { organization_id: string | null }>;
    const saude = interpreta(linhas);
    const orgs = new Set(
      linhas.filter((l) => l.status === "open" && l.organization_id).map((l) => l.organization_id),
    );
    return { ...saude, organizacoes_com_falha: orgs.size };
  } catch (e) {
    logger.warn("[motor] leitura de saúde da instalação não concluída", {
      erro: e instanceof Error ? e.message : String(e),
    });
    return { ...VAZIO, organizacoes_com_falha: 0 };
  }
}
