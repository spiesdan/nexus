/**
 * NEXUS Separação — a conferência antes da rota (§48–§49, migration 0240).
 *
 * "Duas portas, uma regra": PATCH da carga e `transicaoDeRota` (iniciar)
 * usam este helper puro — nunca duas contagens paralelas. Sem I/O,
 * testável sem banco.
 */

export interface ItemSeparavel {
  separado_em?: string | null;
}

/** Quantos itens ainda não foram separados/conferidos. */
export function qtdNaoSeparados(itens: ItemSeparavel[]): number {
  return itens.filter((i) => i.separado_em == null).length;
}

/** A carga pode sair de montando para rota? */
export function podeSairParaRota(itens: ItemSeparavel[]): boolean {
  return itens.length > 0 && qtdNaoSeparados(itens) === 0;
}
