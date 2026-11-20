/**
 * DECISÃO 6 (20/11/2026) — CUSTO NO RESUMO, SEM RECALCULAR O PEDIDO.
 *
 * O item do pedido não guarda custo (`product_id` + snapshot de nome/código/
 * preço). O número honesto é o custo ATUAL do catálogo — e a tela diz isso.
 * Este arquivo prende a conta e os casos em que ela é parcial.
 */
import { describe, expect, it } from "vitest";

import { custoDoPedido, margemDoPedido } from "@/lib/comercial/custo-do-pedido";

const CUSTOS = new Map<string, number | null>([
  ["p1", 3_000],
  ["p2", 1_500],
  ["p3", null],
]);

describe("custoDoPedido", () => {
  it("soma quantidade × custo dos itens com custo conhecido", () => {
    const r = custoDoPedido(
      [
        { product_id: "p1", quantidade: 2 },
        { product_id: "p2", quantidade: 3 },
      ],
      CUSTOS,
    );
    expect(r).toEqual({ totalCents: 2 * 3_000 + 3 * 1_500, semCusto: 0 });
  });

  it("item sem produto vivo e item sem custo contam como parciais, não somam", () => {
    const r = custoDoPedido(
      [
        { product_id: "p1", quantidade: 1 },
        { product_id: "p3", quantidade: 4 },
        { product_id: null, quantidade: 2 },
      ],
      CUSTOS,
    );
    expect(r.totalCents).toBe(3_000);
    expect(r.semCusto).toBe(2);
  });

  it("produto fora do mapa (catálogo de outra medição) também é parcial", () => {
    const r = custoDoPedido([{ product_id: "sumiu", quantidade: 1 }], CUSTOS);
    expect(r).toEqual({ totalCents: 0, semCusto: 1 });
  });

  it("pedido sem itens dá zero, não NaN", () => {
    expect(custoDoPedido([], CUSTOS)).toEqual({ totalCents: 0, semCusto: 0 });
  });
});

describe("margemDoPedido", () => {
  it("margem = total − custo, com percentual sobre o total", () => {
    const custo = custoDoPedido([{ product_id: "p1", quantidade: 1 }], CUSTOS);
    const m = margemDoPedido(5_000, custo);
    expect(m.valorCents).toBe(2_000);
    expect(m.pct).toBeCloseTo(40);
  });

  it("total zero devolve percentual nulo em vez de dividir por zero", () => {
    const m = margemDoPedido(0, { totalCents: 0, semCusto: 0 });
    expect(m).toEqual({ valorCents: 0, pct: null });
  });

  it("custo maior que o total dá margem negativa (prejuízo é informação, não erro)", () => {
    const m = margemDoPedido(1_000, { totalCents: 3_000, semCusto: 0 });
    expect(m.valorCents).toBe(-2_000);
    expect(m.pct).toBeCloseTo(-200);
  });
});
