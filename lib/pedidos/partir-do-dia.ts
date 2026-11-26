/**
 * O DIA EM TRÊS PARTES: venda, orçamento, cancelado.
 *
 * O cabeçalho do dia somava tudo num número só — "8 pedidos · R$ 10.345,80"
 * com três "Em orçamento" e um cancelado dentro (reclamação do dono em
 * 26/11/2026: "separe pedido de orçamento, pois orçamento não é pedido").
 *
 * A regra é por STATUS, não por heurística de valor: `rascunho` é o rótulo
 * "Em orçamento" e `cancelado` é passado. As três parcelas sempre fecham com o
 * total do dia — é o que impede o número de mentir consigo mesmo.
 */
export interface PedidoParaPartir {
  status: string;
  total_cents: number | null;
}

export interface ParteDoDia {
  n: number;
  total: number;
}

export interface DiaPartido {
  vendas: ParteDoDia;
  orcamentos: ParteDoDia;
  cancelados: ParteDoDia;
  /** Soma crua do dia — igual à soma das três partes. Exposto para o teste. */
  fecha: number;
}

export function partirDoDia<T extends PedidoParaPartir>(itens: T[]): DiaPartido {
  const soma = (lista: T[]) => lista.reduce((s, p) => s + (p.total_cents ?? 0), 0);
  const ehOrcamento = (p: T) => p.status === "rascunho";
  const ehCancelado = (p: T) => p.status === "cancelado";

  const vendas = itens.filter((p) => !ehOrcamento(p) && !ehCancelado(p));
  const orcamentos = itens.filter(ehOrcamento);
  const cancelados = itens.filter(ehCancelado);

  return {
    vendas: { n: vendas.length, total: soma(vendas) },
    orcamentos: { n: orcamentos.length, total: soma(orcamentos) },
    cancelados: { n: cancelados.length, total: soma(cancelados) },
    fecha: soma(itens),
  };
}
