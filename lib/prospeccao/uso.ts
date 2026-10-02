/**
 * Camada central de consumo da prospecção — o `PlacesUsageManager` (seção 6) e
 * o `DailyProspectingLimits` (seção 20) da spec 19 numa fronteira só: o que já
 * se gastou, o que o teto mensal manda fazer (seção 24) e o teto diário.
 *
 * As regras vivem AQUI, não espalhadas: o motor consulta o estado do orçamento
 * antes de qualquer chamada paga, o POST de busca recusa em 100% com a
 * mensagem literal da spec, e a rota de consumo alimenta o painel "Consumo de
 * Prospecção" (seção 21). Uma mensagem de recusa, uma constante — motor, API
 * e painel leem o mesmo texto.
 *
 * Os números vêm de `prospecting_searches` (requisições/detalhes/custo por
 * busca — a mesma régua que o motor já grava) e de `prospecting_cache_hits`
 * (o hit de cache não cria busca nova — seção 7 —, então só aquela tabela o
 * enxerga). "Cache misses" do painel = buscas criadas no período: POST que
 * não achou busca recente dentro do TTL.
 *
 * Degradação declarada (molde `lib/ai/budget/check.ts`): se a leitura do
 * gasto falhar, o consumo volta 0 + `logger.warn` — janela de um tick (1/min),
 * e o próximo tick recalcula; o erro nunca some em silêncio.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export type EstadoOrcamento = "sem_limite" | "ok" | "aviso" | "reducao" | "bloqueio";

export interface DecisaoOrcamento {
  estado: EstadoOrcamento;
  gasto_cents: number;
  limite_cents: number | null;
  /** Percentual do gasto sobre o teto, com 2 casas (23.4 = 23,4%). */
  pct: number;
}

/** 80% avisa, 90% reduz a automação, 100% bloqueia — limiares da seção 24. */
export const PCT_AVISO = 80;
export const PCT_REDUCAO = 90;

/** A recusa do §24, literal — motor, POST e painel usam ESTA string. */
export const MENSAGEM_ORCAMENTO_ATINGIDO =
  "Limite de prospecção atingido. Aumente o limite ou aguarde a renovação.";

/** O alerta do §21 ao lado do percentual (só acima de 80%). */
export const MENSAGEM_ORCAMENTO_PROXIMO = "⚠️ Próximo do limite configurado";

/**
 * A decisão do budget guard (§24) em função pura — o mesmo número que aparece
 * no painel é o que para o motor, e não há segunda régua. Limite `null`/`0` =
 * sem teto (a ausência de limite é isso em toda a feature, molde `ai_budgets`).
 */
export function estadoDoOrcamento(
  gastoCents: number,
  limiteCents: number | null | undefined,
): DecisaoOrcamento {
  if (limiteCents == null || limiteCents <= 0) {
    return { estado: "sem_limite", gasto_cents: gastoCents, limite_cents: null, pct: 0 };
  }
  const pct = Math.round((gastoCents * 10000) / limiteCents) / 100;
  let estado: EstadoOrcamento = "ok";
  if (pct >= 100) estado = "bloqueio";
  else if (pct >= PCT_REDUCAO) estado = "reducao";
  else if (pct >= PCT_AVISO) estado = "aviso";
  return { estado, gasto_cents: gastoCents, limite_cents: limiteCents, pct };
}

/** Teto diário de requisições (§20): cheio = para, sem erro e sem retry cego. */
export function limiteDiarioAtingido(gastoHoje: number, limiteDiario: number): boolean {
  return gastoHoje >= limiteDiario;
}

/** O que o painel mostra ao lado do percentual (§21/§24). */
export function alertaDoOrcamento(decisao: DecisaoOrcamento): string | null {
  if (decisao.estado === "bloqueio") return MENSAGEM_ORCAMENTO_ATINGIDO;
  if (decisao.estado === "aviso" || decisao.estado === "reducao") return MENSAGEM_ORCAMENTO_PROXIMO;
  return null;
}

/** Consumo de um período, tudo em unidades do próprio domínio. */
export interface ConsumoPeriodo {
  /** Soma de `requisicoes` — a consulta paga (e a requisição grátis do OSM). */
  consultas: number;
  /** Soma de `detalhes` — chamadas de Place Details (etapa 2, D8). */
  enriquecimentos: number;
  /** Soma de `encontradas` — empresas devolvidas (novas + já vistas). */
  descobertas: number;
  /** Soma de `novas` — linhas que entraram em `business_prospects`. */
  novas: number;
  /** Soma de `custo_estimado_cents` — a estimativa gravada pelo motor. */
  custo_cents: number;
  /** Buscas criadas no período = misses de cache (o hit não cria busca). */
  buscas: number;
  /** Hits registrados em `prospecting_cache_hits`. */
  hits: number;
}

/** Início do mês corrente em UTC — a mesma janela que o motor usa (hoje UTC). */
export function inicioDoMesUtc(): string {
  const agora = new Date();
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
}

/** Início do dia corrente em UTC — a mesma régua do teto diário do motor. */
export function inicioDoDiaUtc(): string {
  return new Date().toISOString().slice(0, 10) + "T00:00:00Z";
}

type LinhaBusca = {
  requisicoes: number;
  detalhes: number;
  encontradas: number;
  novas: number;
  custo_estimado_cents: number;
};

/**
 * Agregado do período: 2 queries (buscas do período + contagem de hits),
 * reduzidas no cliente — volume de busca por tenant é dezenas/meses, e a
 * régua de custo vive linha a linha desde a FASE 6.
 */
export async function consumoDoPeriodo(
  admin: SupabaseClient,
  organizationId: string,
  desde: string,
): Promise<ConsumoPeriodo> {
  const [buscasRes, hitsRes] = await Promise.all([
    admin
      .from("prospecting_searches")
      .select("requisicoes, detalhes, encontradas, novas, custo_estimado_cents")
      .eq("organization_id", organizationId)
      .gte("created_at", desde),
    admin
      .from("prospecting_cache_hits")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("hit_at", desde),
  ]);

  if (buscasRes.error) {
    logger.warn("[prospeccao] consumo do periodo sem buscas — volta zerado", {
      organization_id: organizationId,
      causa: buscasRes.error.message,
    });
  }
  if (hitsRes.error) {
    logger.warn("[prospeccao] consumo do periodo sem hits de cache — volta zerado", {
      organization_id: organizationId,
      causa: hitsRes.error.message,
    });
  }

  const linhas = (buscasRes.data ?? []) as unknown as LinhaBusca[];
  const soma = (campo: keyof LinhaBusca) => linhas.reduce((s, r) => s + (Number(r[campo]) || 0), 0);

  return {
    consultas: soma("requisicoes"),
    enriquecimentos: soma("detalhes"),
    descobertas: soma("encontradas"),
    novas: soma("novas"),
    custo_cents: soma("custo_estimado_cents"),
    buscas: linhas.length,
    hits: hitsRes.count ?? 0,
  };
}

/** A decisão do budget guard para o mês corrente (gasto pela mesma régua do painel). */
export async function orcamentoDoMes(
  admin: SupabaseClient,
  organizationId: string,
  limiteCents: number | null,
): Promise<DecisaoOrcamento> {
  const consumo = await consumoDoPeriodo(admin, organizationId, inicioDoMesUtc());
  return estadoDoOrcamento(consumo.custo_cents, limiteCents);
}

/**
 * Registra um hit de cache (seção 7/§21). Best-effort de propósito: falhar a
 * contagem do painel não pode derrubar o hit em si — o dado grátis é devolvido
 * do mesmo jeito, e o aviso fica no log.
 */
export async function registrarCacheHit(
  admin: SupabaseClient,
  organizationId: string,
  searchId: string,
): Promise<void> {
  const { error } = await admin.from("prospecting_cache_hits").insert({
    organization_id: organizationId,
    search_id: searchId,
  });
  if (error) {
    logger.warn("[prospeccao] nao deu para registrar hit de cache", {
      organization_id: organizationId,
      causa: error.message,
    });
  }
}
