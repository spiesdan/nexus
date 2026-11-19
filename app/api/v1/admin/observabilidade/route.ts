import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type EstadoSlo = "ok" | "em_risco" | "estourado" | "sem_historico";

interface Slo {
  id: "disponibilidade" | "latencia" | "frescor_sentinel";
  titulo: string;
  formula: string;
  janela: string;
  alvo: string;
  unidade: "%" | "ms";
  valor: number | null;
  estado: EstadoSlo;
  nota: string;
  detalhe?: Record<string, number | string | null>;
}

const PADRAO_INTERVALO_MIN = 360;

function estadoPorValor(
  valor: number,
  alvo: number,
  margemDeRisco: number,
): Exclude<EstadoSlo, "sem_historico"> {
  if (valor >= alvo) return "ok";
  if (valor >= alvo - margemDeRisco) return "em_risco";
  return "estourado";
}

function fresco(
  agoraMs: number,
  ultima: string | null,
  intervaloMinutos: number,
): boolean {
  if (!ultima) return false;
  const ms = Date.parse(ultima);
  if (Number.isNaN(ms)) return false;
  return agoraMs - ms <= 2 * Math.max(15, intervaloMinutos) * 60_000;
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();

  try {
    await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  const admin = createAdminClient();
  const [{ data: orgs, error: erroOrgs }, { data: settings, error: erroSettings }] =
    await Promise.all([
      admin
        .from("organizations")
        .select("id")
        .eq("status", "active")
        .is("suspended_at", null)
        .limit(5_000),
      admin
        .from("sentinel_settings")
        .select("organization_id, ativo, intervalo_minutos, ultima_execucao_em")
        .limit(5_000),
    ]);

  if (erroOrgs) {
    return fail("internal_error", "Não foi possível ler as organizações.", 500, { requestId });
  }
  if (erroSettings) {
    return fail("internal_error", "Não foi possível ler a configuração do Sentinel.", 500, {
      requestId,
    });
  }

  const porOrg = new Map(
    ((settings ?? []) as Array<{
      organization_id: string;
      ativo: boolean | null;
      intervalo_minutos: number | null;
      ultima_execucao_em: string | null;
    }>).map((linha) => [linha.organization_id, linha]),
  );

  const agoraMs = Date.now();
  let total = 0;
  let emDia = 0;
  let piorAtrasoMin = 0;
  for (const org of (orgs ?? []) as Array<{ id: string }>) {
    const config = porOrg.get(org.id);
    if (config?.ativo === false) continue;
    total += 1;
    const intervalo = Math.max(15, Number(config?.intervalo_minutos) || PADRAO_INTERVALO_MIN);
    const ultima = config?.ultima_execucao_em ?? null;
    if (fresco(agoraMs, ultima, intervalo)) {
      emDia += 1;
      continue;
    }
    if (ultima) {
      const ms = Date.parse(ultima);
      if (Number.isFinite(ms)) {
        piorAtrasoMin = Math.max(piorAtrasoMin, Math.round((agoraMs - ms) / 60_000));
      }
    } else {
      piorAtrasoMin = Number.POSITIVE_INFINITY;
    }
  }

  const valorFrescor = total > 0 ? Math.round((emDia / total) * 1000) / 10 : null;
  const estadoFrescor: EstadoSlo =
    valorFrescor === null ? "sem_historico" : estadoPorValor(valorFrescor, 99, 2);

  const slos: Slo[] = [
    {
      id: "disponibilidade",
      titulo: "Disponibilidade das rotas quentes",
      formula: "1 − (respostas 5xx / total)",
      janela: "7 dias",
      alvo: "≥ 99,5%",
      unidade: "%",
      valor: null,
      estado: "sem_historico",
      nota:
        "Sem série histórica consultável. A fonte é o log estruturado `api.5xx`, que ainda não é persistido em tabela; zero seria mentira, não saúde.",
    },
    {
      id: "latencia",
      titulo: "Latência das listas",
      formula: "p95 das rotas quentes (2xx)",
      janela: "janelas de 5 min · 7 dias",
      alvo: "≤ 800 ms",
      unidade: "ms",
      valor: null,
      estado: "sem_historico",
      nota:
        "Sem série histórica consultável. O doc 42 tem a medição local (p50 109–174 ms), mas não é produção nem série.",
    },
    {
      id: "frescor_sentinel",
      titulo: "Frescor da varredura do Sentinel",
      formula: "% de orgs ativas com `ultima_execucao_em` ≤ 2× intervalo",
      janela: "24 h",
      alvo: "≥ 99%",
      unidade: "%",
      valor: valorFrescor,
      estado: estadoFrescor,
      nota:
        valorFrescor === null
          ? "Sem organização ativa para medir."
          : `${emDia}/${total} organizações em dia.`,
      detalhe: {
        orgs_em_dia: emDia,
        orgs_ativas: total,
        pior_atraso_min: Number.isFinite(piorAtrasoMin) ? piorAtrasoMin : null,
      },
    },
  ];

  return ok(
    {
      gerado_em: new Date(agoraMs).toISOString(),
      slos,
    },
    { requestId },
  );
}
