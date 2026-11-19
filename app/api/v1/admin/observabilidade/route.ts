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
  detalhe?: Record<string, number | string | boolean | null>;
}

const PADRAO_INTERVALO_MIN = 360;

/**
 * O PostgREST corta em `max_rows` (supabase/config.toml: 1000): um
 * `.limit(5_000)` não devolve 5.000 — devolve 1.000, sem erro e sem aviso.
 * Num SLO isso é mentira silenciosa: o denominador vira a página, não a
 * instalação, e uma org arquivada que nunca mais roda o Sentinel some da
 * conta em vez de aparecer atrasada. Lemos por `range` até a página vir
 * curta; `MAX_PAGINAS` é só a guarda de sanidade, e se ela for atingida a
 * tela DIZ que amostrou.
 */
const TAMANHO_DA_PAGINA = 1_000;
const MAX_PAGINAS = 50;

type ErroDeLeitura = { message: string };

async function lerTodasAsPaginas<T>(
  montar: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: T[] | null; error: ErroDeLeitura | null }>,
): Promise<{ dados: T[]; erro: ErroDeLeitura | null; truncada: boolean }> {
  const dados: T[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const de = pagina * TAMANHO_DA_PAGINA;
    const { data, error } = await montar(de, de + TAMANHO_DA_PAGINA - 1);
    if (error) return { dados, erro: error, truncada: false };
    const linhas = data ?? [];
    dados.push(...linhas);
    if (linhas.length < TAMANHO_DA_PAGINA) return { dados, erro: null, truncada: false };
  }
  return { dados, erro: null, truncada: true };
}

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
  const [orgsRes, settingsRes] = await Promise.all([
    lerTodasAsPaginas<{ id: string }>((de, ate) =>
      admin
        .from("organizations")
        .select("id")
        .eq("status", "active")
        .is("suspended_at", null)
        // Ordem estável: paginar sem `order` pode repetir/pular linha.
        .order("id")
        .range(de, ate),
    ),
    lerTodasAsPaginas<{
      organization_id: string;
      ativo: boolean | null;
      intervalo_minutos: number | null;
      ultima_execucao_em: string | null;
    }>((de, ate) =>
      admin
        .from("sentinel_settings")
        .select("organization_id, ativo, intervalo_minutos, ultima_execucao_em")
        .order("organization_id")
        .range(de, ate),
    ),
  ]);

  if (orgsRes.erro) {
    return fail("internal_error", "Não foi possível ler as organizações.", 500, { requestId });
  }
  if (settingsRes.erro) {
    return fail("internal_error", "Não foi possível ler a configuração do Sentinel.", 500, {
      requestId,
    });
  }

  const orgs = orgsRes.dados;
  const settings = settingsRes.dados;

  const porOrg = new Map(settings.map((linha) => [linha.organization_id, linha]));

  const agoraMs = Date.now();
  let total = 0;
  let emDia = 0;
  let piorAtrasoMin = 0;
  for (const org of orgs) {
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
        // Se a guarda de paginação bata, o número é amostra — e a tela diz.
        amostra_truncada: orgsRes.truncada || settingsRes.truncada,
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
