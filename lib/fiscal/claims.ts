/**
 * CLAIMS DE OPERAÇÃO FISCAL (0318) — a transmissão acontece uma vez.
 *
 * Manifestação de entrada e cancelamento de nota autorizada chamavam a SEFAZ
 * antes de qualquer trava: dois cliques simultâneos transmitiam dois eventos
 * (210210/110111). O claim é um UPDATE condicional na própria linha:
 *
 *   claim = now()  WHERE id = ? AND (claim IS NULL OR claim < now() - 5 min)
 *
 * A primeira transação fica com a linha; a segunda espera e reavalia o WHERE,
 * devolvendo 0 linhas (a rota responde 409). O TTL recupera processo morto:
 * passado o teto, a operação pode ser reivindicada de novo. Nenhum status
 * muda durante o claim — a linha continua `autorizada`/`nova` enquanto
 * transmite.
 *
 * A implementação usa DUAS leituras no Supabase (`.is(null)` e depois
 * `.lt(limite)`) em vez de um `or(...)` com timestamp no texto do PostgREST:
 * é a mesma condição, sem depender da gramática de filtro para datas, e o
 * UPDATE continua atômico em cada passo.
 */

export const CLAIM_TTL_MIN = 5;

/** Limite de staleness: claim anterior a este instante pode ser retomado. */
export function limiteDoClaim(agora: Date, ttlMin: number = CLAIM_TTL_MIN): string {
  return new Date(agora.getTime() - ttlMin * 60_000).toISOString();
}
