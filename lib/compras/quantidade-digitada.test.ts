/**
 * RECEBER 3 DE 10 — a régua do campo, sem navegador.
 *
 * A rota de recebimento sempre aceitou quantidade parcial; a tela só sabia
 * "receber tudo". Estes casos prendem a decisão que o operador vê enquanto
 * digita: o que é erro, o que é "não chegou nada deste item" e por que 0 não
 * entra no lote.
 */
import { describe, expect, it } from "vitest";

import {
  linhasParaReceber,
  problemaDaQuantidade,
  quantidadeDoCampo,
  restanteDoItem,
} from "./quantidade-digitada";

const item = (quantidade: number, recebidoQtd: number, id = "i1") => ({ id, quantidade, recebidoQtd });

describe("restante do item", () => {
  it("é a diferença entre o pedido e o já recebido", () => {
    expect(restanteDoItem(item(10, 3))).toBe(7);
  });

  it("nunca é negativo, mesmo com dado torto", () => {
    expect(restanteDoItem(item(10, 12))).toBe(0);
  });
});

describe("o que o campo aceita", () => {
  it("vazio significa o padrão (o restante), não erro", () => {
    expect(problemaDaQuantidade(undefined, 7)).toBeNull();
    expect(problemaDaQuantidade("", 7)).toBeNull();
    expect(quantidadeDoCampo("", 7)).toBe(7);
  });

  it("aceita o que é inteiro e cabe no restante", () => {
    expect(problemaDaQuantidade("3", 7)).toBeNull();
    expect(problemaDaQuantidade("7", 7)).toBeNull();
    expect(problemaDaQuantidade("0", 7)).toBeNull();
  });

  it("vírgula é teclado de pt-BR: 3,5 continua sendo fração recusada", () => {
    expect(problemaDaQuantidade("3,5", 7)).toBe(
      "Quantidade inteira — o estoque não tem fração.",
    );
  });

  it("recusa acima do restante, dizendo qual é o restante", () => {
    expect(problemaDaQuantidade("8", 7)).toBe("O restante é 7.");
  });

  it("recusa negativo e texto", () => {
    expect(problemaDaQuantidade("-1", 7)).toBe("Quantidade não pode ser negativa.");
    expect(problemaDaQuantidade("abc", 7)).toBe("Digite um número inteiro.");
  });
});

describe("as linhas que vão no POST", () => {
  it("só o que tem quantidade > 0", () => {
    const linhas = linhasParaReceber([item(10, 0, "a"), item(5, 0, "b")], { a: "3", b: "0" });
    expect(linhas).toEqual([{ item_id: "a", quantidade: 3 }]);
  });

  it("sem nada digitado, manda o restante de cada item", () => {
    const linhas = linhasParaReceber([item(10, 4, "a")], {});
    expect(linhas).toEqual([{ item_id: "a", quantidade: 6 }]);
  });

  it("item já completo não vira linha (restante 0)", () => {
    const linhas = linhasParaReceber([item(5, 5, "a")], {});
    expect(linhas).toEqual([]);
  });

  it("fração digitada não entra no lote", () => {
    const linhas = linhasParaReceber([item(10, 0, "a")], { a: "2,5" });
    expect(linhas).toEqual([]);
  });
});
