/**
 * CUSTO DO PEDIDO PARA O RESUMO — decisão 6 (20/11/2026).
 *
 * O resumo do pedido mostra quantidade e valor; não mostrava custo/margem. O
 * item do pedido **não guarda** o custo: ele tem `product_id` (anulável) e o
 * snapshot de nome/código/preço. Então o número honesto é o custo **atual do
 * catálogo** — e a tela diz isso. Inventar um custo histórico exigiria
 * snapshot no item (decisão de schema, não desta fatia).
 *
 * Regra: soma `quantidade × custo` dos itens com produto e custo conhecidos;
 * itens sem produto (removido do catálogo) ou sem custo entram na contagem
 * `semCusto` para a tela poder avisar que o total é parcial.
 *
 * **Não recalcula o preço do pedido** — o total continua o gravado.
 */
export interface ItemParaCusto {
  product_id: string | null;
  quantidade: number;
}

export interface CustoDoPedido {
  /** Soma dos itens com custo conhecido. */
  totalCents: number;
  /** Itens que ficaram fora (sem produto vivo ou sem custo cadastrado). */
  semCusto: number;
}

export function custoDoPedido(
  itens: readonly ItemParaCusto[],
  custosPorProduto: ReadonlyMap<string, number | null | undefined>,
): CustoDoPedido {
  let totalCents = 0;
  let semCusto = 0;

  for (const item of itens) {
    const custo = item.product_id ? custosPorProduto.get(item.product_id) : null;
    if (custo == null) {
      semCusto++;
      continue;
    }
    totalCents += item.quantidade * custo;
  }

  return { totalCents, semCusto };
}

/**
 * Margem em centavos e percentual — só para quem pode ver.
 *
 * Percentual sobre o **total do pedido** (o que o cliente paga), não sobre o
 * custo: é a leitura que o dono usa ("de cada R$ 100 vendidos, sobram R$ X").
 * Divisão por zero não existe: total 0 devolve `null`.
 */
export function margemDoPedido(
  totalCents: number,
  custo: CustoDoPedido,
): { valorCents: number; pct: number | null } {
  const valorCents = totalCents - custo.totalCents;
  return {
    valorCents,
    pct: totalCents > 0 ? (valorCents / totalCents) * 100 : null,
  };
}
