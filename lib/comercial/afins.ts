/**
 * NEXUS Product Intelligence — afinidade real entre produtos (§25, §45).
 *
 * "Cliente compra X, normalmente também compra Y": coocorrência nos
 * pedidos reais + recorrência do cliente. Funções puras (sem I/O):
 * quem chama carrega `commercial_order_items` com `organization_id`
 * explícito e passa aqui. Sem mock, sem palpite.
 */

export interface ItemPar {
  order_id: string;
  product_id: string | null;
}

export interface Afinidade {
  product_id: string;
  /** em quantos pedidos apareceu junto do carrinho. */
  vezes_junto: number;
}

/**
 * Produtos que mais aparecem NOS MESMOS pedidos do carrinho.
 * `carrinho` vazio → vazio (sem contexto, sem sugestão).
 */
export function topCoocorrencia(itens: ItemPar[], carrinho: string[], limite = 5): Afinidade[] {
  const cesta = new Set(carrinho);
  if (cesta.size === 0) return [];
  const pedidosComCarrinho = new Set<string>();
  for (const i of itens) {
    if (i.product_id && cesta.has(i.product_id)) pedidosComCarrinho.add(i.order_id);
  }
  if (pedidosComCarrinho.size === 0) return [];
  const contagem = new Map<string, number>();
  for (const i of itens) {
    if (!i.product_id || cesta.has(i.product_id)) continue;
    if (!pedidosComCarrinho.has(i.order_id)) continue;
    contagem.set(i.product_id, (contagem.get(i.product_id) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([product_id, vezes_junto]) => ({ product_id, vezes_junto }))
    .sort((a, b) => b.vezes_junto - a.vezes_junto)
    .slice(0, Math.max(1, limite));
}

export interface Recorrencia {
  product_id: string;
  /** em quantos pedidos do cliente apareceu. */
  vezes: number;
}

/** O que o cliente mais repete (excluindo o que já está no carrinho). */
export function topRecorrentes(
  frequencia: Recorrencia[],
  excluir: string[],
  limite = 5,
): Recorrencia[] {
  const fora = new Set(excluir);
  return frequencia
    .filter((f) => !fora.has(f.product_id))
    .sort((a, b) => b.vezes - a.vezes)
    .slice(0, Math.max(1, limite));
}
