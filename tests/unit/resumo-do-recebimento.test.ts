/**
 * DECISÃO 6 (20/11/2026) — RECEBIMENTO MOSTRA QUANTIDADE **E** VALOR.
 *
 * O resumo mostrava só unidades. O valor é o do **item da compra**
 * (`custo_unit_cents`, o negociado com o fornecedor), não o custo de catálogo,
 * e nada aqui toca o pedido.
 */
import { describe, expect, it } from "vitest";

import { resumoDoRecebimento } from "@/lib/compras/resumo-do-recebimento";

describe("resumoDoRecebimento", () => {
  it("soma unidades e valores do pedido e do já recebido", () => {
    const r = resumoDoRecebimento([
      { quantidade: 10, recebido_qtd: 10, custo_unit_cents: 500 }, //  50,00 pedido · 50,00 recebido
      { quantidade: 4, recebido_qtd: 0, custo_unit_cents: 1_250 }, //  50,00 pedido ·  0,00 recebido
    ]);
    expect(r).toEqual({
      unidadesPedidas: 14,
      unidadesRecebidas: 10,
      custoPedidoCents: 10_000,
      custoRecebidoCents: 5_000,
    });
  });

  it("recebimento parcial não infla o valor recebido", () => {
    const r = resumoDoRecebimento([{ quantidade: 10, recebido_qtd: 3, custo_unit_cents: 1_000 }]);
    expect(r.custoRecebidoCents).toBe(3_000);
    expect(r.custoPedidoCents).toBe(10_000);
  });

  it("pedido sem itens dá zero em tudo, não NaN", () => {
    expect(resumoDoRecebimento([])).toEqual({
      unidadesPedidas: 0,
      unidadesRecebidas: 0,
      custoPedidoCents: 0,
      custoRecebidoCents: 0,
    });
  });
});
