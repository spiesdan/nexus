/**
 * RESUMO DO RECEBIMENTO — quantidade E valor (decisão 6, 20/11/2026).
 *
 * A tela mostrava só "X/Y unidades recebidas". O valor sai do **item da
 * compra** (`custo_unit_cents`), não do catálogo: é o custo que foi negociado
 * com o fornecedor naquele pedido, e é isso que o operador confere ao receber.
 *
 * Nada aqui altera o pedido — é leitura.
 */
export interface ItemDoRecebimento {
  quantidade: number;
  recebido_qtd: number;
  custo_unit_cents: number;
}

export interface ResumoDoRecebimento {
  unidadesPedidas: number;
  unidadesRecebidas: number;
  custoPedidoCents: number;
  custoRecebidoCents: number;
}

export function resumoDoRecebimento(
  itens: readonly ItemDoRecebimento[],
): ResumoDoRecebimento {
  return itens.reduce<ResumoDoRecebimento>(
    (acc, i) => ({
      unidadesPedidas: acc.unidadesPedidas + i.quantidade,
      unidadesRecebidas: acc.unidadesRecebidas + i.recebido_qtd,
      custoPedidoCents: acc.custoPedidoCents + i.quantidade * i.custo_unit_cents,
      custoRecebidoCents: acc.custoRecebidoCents + i.recebido_qtd * i.custo_unit_cents,
    }),
    {
      unidadesPedidas: 0,
      unidadesRecebidas: 0,
      custoPedidoCents: 0,
      custoRecebidoCents: 0,
    },
  );
}
