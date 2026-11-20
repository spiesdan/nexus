/**
 * TROCA DE TABELA: A LISTA DE MUDANÇAS É EXPLÍCITA E O MANUAL FICA DE FORA.
 *
 * O editor só aplica depois de mostrar de → para; esta régua pura é a mesma que
 * a tela usa. Preço manual é decisão comercial: nem entra na lista.
 */
import { describe, expect, it } from "vitest";

import { mudancasDePreco, type ProdutoParaReprecificar } from "@/lib/comercial/reprecificacao";

const produtos = new Map<string, ProdutoParaReprecificar>([
  ["p1", { id: "p1", preco_cents: 10000 }],
  ["p2", { id: "p2", preco_cents: 5000 }],
]);

const linhas = [
  { key: "l1", nome: "Produto um", product_id: "p1", precoTexto: "100,00", origemPreco: "base" as const },
  { key: "l2", nome: "Produto dois", product_id: "p2", precoTexto: "50,00", origemPreco: "base" as const },
  { key: "l3", nome: "Manual", product_id: "p1", precoTexto: "42,00", origemPreco: "manual" as const },
];

describe("mudancasDePreco", () => {
  it("lista de → para só o que muda e conta os manuais", () => {
    const { mudancas, manuais } = mudancasDePreco(linhas, produtos, {
      desconto_pct: 10,
      overrides: new Map([["p2", 4700]]),
    });

    expect(mudancas).toEqual([
      { key: "l1", nome: "Produto um", deCents: 10000, paraCents: 9000 },
      { key: "l2", nome: "Produto dois", deCents: 5000, paraCents: 4700 },
    ]);
    expect(manuais).toBe(1);
  });

  it("sem tabela, a mudança é para o preço base", () => {
    const { mudancas } = mudancasDePreco(
      [{ key: "l1", nome: "Produto um", product_id: "p1", precoTexto: "90,00", origemPreco: "tabela" }],
      produtos,
      null,
    );
    expect(mudancas).toEqual([{ key: "l1", nome: "Produto um", deCents: 9000, paraCents: 10000 }]);
  });

  it("se nada muda, a lista fica vazia (a tela não pergunta à toa)", () => {
    const { mudancas } = mudancasDePreco(
      [{ key: "l1", nome: "Produto um", product_id: "p1", precoTexto: "100,00", origemPreco: "base" }],
      produtos,
      { desconto_pct: 0, overrides: new Map() },
    );
    expect(mudancas).toEqual([]);
  });
});
