/**
 * `supabase.rpc()` devolve um ARRAY de linhas para funções `returns table(...)`.
 *
 * Defeito medido em produção em 23/11/2026: `fn_slo_api_resumo` devolve
 * `[{ total: 267, erros: 0, p95: 2660 }]`, e os dois leitores faziam
 * `(data as { total?: number }).total` → `undefined` → `Number(0)` → "sem
 * histórico". O SLO estava estourado (p95 2660 ms, alvo 800) e **nenhuma**
 * ocorrência `plataforma.slo_estourado` era aberta — o detector nunca rodava.
 *
 * Normalizar aqui, num lugar só, cobre os dois leitores (coleta do Sentinel e
 * tela de observabilidade). Aceitar objeto também não custa nada e protege se
 * um dia o PostgREST/devolver um único objeto para uma função `returns record`.
 */
export function linhaRpc<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return (data as T | null | undefined) ?? null;
}

/** Um número de uma linha de RPC, com o mesmo `Number(...)` dos leitores. */
export function numeroRpc(valor: unknown): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** p95 de uma linha de RPC: `null` continua `null` (sem série), não vira 0. */
export function p95Rpc(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** A linha normalizada que os dois leitores do SLO consomem. */
export interface ResumoSloRpc {
  total: number;
  erros: number;
  p95: number | null;
}

/**
 * Lê `fn_slo_api_resumo` de um jeito só para o Sentinel e para a tela.
 *
 * Com o array de produção `[{ total: 267, erros: 0, p95: 2660 }]`, devolve
 * `{ total: 267, erros: 0, p95: 2660 }` —total > 0—, em vez do `{total: 0}`
 * que fazia o detector não abrir e a tela dizer "sem histórico".
 */
export function resumoSloRpc(data: unknown): ResumoSloRpc {
  const linha = linhaRpc<{ total?: unknown; erros?: unknown; p95?: unknown }>(data);
  return {
    total: numeroRpc(linha?.total),
    erros: numeroRpc(linha?.erros),
    p95: p95Rpc(linha?.p95),
  };
}
