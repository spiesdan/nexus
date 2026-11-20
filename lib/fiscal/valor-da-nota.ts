/**
 * Valor da nota na RETOMADA (job que estava em `em_emissao` e volta).
 *
 * A emissão nova já soma os pedidos do agrupamento (`emitir-nota.ts`). A
 * retomada não somava: usava `invoices.order_id`, o pedido principal. Numa
 * nota agrupada isso reemite com o valor de UM pedido só — um documento fiscal
 * com total menor que o fato que ele declara.
 *
 * `null` é resposta válida e significa "não dá para saber": pedido vinculado
 * que não veio na leitura (sumiu, ou a coleta truncou). Emitir com soma
 * parcial seria declarar ao fisco um total que ninguém conferiu.
 */
export function totalDaNotaAoRetomar(
  idPrincipal: string,
  idsVinculados: readonly string[],
  linhas: readonly { id: string; total_cents: number }[],
): number | null {
  const ids = [...new Set(idsVinculados)];
  // Sem vínculo listado, a própria nota ainda tem o `order_id` principal.
  if (ids.length <= 1) {
    const alvo = ids[0] ?? idPrincipal;
    return linhas.find((l) => l.id === alvo)?.total_cents ?? null;
  }

  const porId = new Map(linhas.map((l) => [l.id, l.total_cents]));
  let soma = 0;
  for (const id of ids) {
    const total = porId.get(id);
    if (total === undefined) return null;
    soma += total;
  }
  return soma;
}
