import { describe, expect, it } from "vitest";

import { topCoocorrencia, topRecorrentes, type ItemPar } from "@/lib/comercial/afins";

const ITENS: ItemPar[] = [
  { order_id: "o1", product_id: "x" },
  { order_id: "o1", product_id: "y" },
  { order_id: "o2", product_id: "x" },
  { order_id: "o2", product_id: "y" },
  { order_id: "o2", product_id: "z" },
  { order_id: "o3", product_id: "w" },
  { order_id: "o3", product_id: "z" },
];

describe("afins (coocorrência real)", () => {
  it("quem compra X também leva Y (2 juntos) antes de Z (1 junto)", () => {
    const top = topCoocorrencia(ITENS, ["x"]);
    expect(top.map((a) => a.product_id)).toEqual(["y", "z"]);
    expect(top[0]?.vezes_junto).toBe(2);
  });

  it("carrinho vazio ou sem histórico não sugere nada", () => {
    expect(topCoocorrencia(ITENS, [])).toEqual([]);
    expect(topCoocorrencia(ITENS, ["qq"])).toEqual([]);
  });

  it("nunca sugere o que já está no carrinho", () => {
    const top = topCoocorrencia(ITENS, ["x", "y"]);
    expect(top.map((a) => a.product_id)).not.toContain("x");
    expect(top.map((a) => a.product_id)).not.toContain("y");
  });

  it("recorrentes ordenam por repetição e excluem o carrinho", () => {
    const rec = topRecorrentes(
      [
        { product_id: "a", vezes: 9 },
        { product_id: "b", vezes: 3 },
        { product_id: "c", vezes: 5 },
      ],
      ["a"],
    );
    expect(rec.map((r) => r.product_id)).toEqual(["c", "b"]);
  });
});
