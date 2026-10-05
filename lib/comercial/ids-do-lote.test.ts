import { describe, expect, it } from "vitest";

import { MAXIMO_PEDIDOS_NO_LOTE, idsDoLote } from "./ids-do-lote";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

describe("idsDoLote", () => {
  it("lê a query string e mantém a ordem escrita", () => {
    expect(idsDoLote(`${C},${A},${B}`)).toEqual([C, A, B]);
  });

  it("aceita o valor só (sem a chave `ids=`)", () => {
    expect(idsDoLote(A)).toEqual([A]);
  });

  it("recusa o que não é UUID — nunca chega ao Postgres", () => {
    expect(idsDoLote(`${A},drop table,../../x, 1, ${B}`)).toEqual([A, B]);
    expect(idsDoLote(`${A};drop table`)).toEqual([]);
    expect(idsDoLote("abc")).toEqual([]);
    expect(idsDoLote("")).toEqual([]);
    expect(idsDoLote(null)).toEqual([]);
    expect(idsDoLote(undefined)).toEqual([]);
  });

  it("deduplica ANTES do teto: repetir não consome vaga", () => {
    const repetido = Array.from({ length: MAXIMO_PEDIDOS_NO_LOTE }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    const comRepetido = [...repetido, repetido[0], repetido[1]];
    expect(idsDoLote(comRepetido.join(",")).length).toBe(MAXIMO_PEDIDOS_NO_LOTE);
  });

  it("respeita o teto da barra de massa", () => {
    const muitos = Array.from(
      { length: MAXIMO_PEDIDOS_NO_LOTE + 20 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    expect(idsDoLote(muitos.join(",")).length).toBe(MAXIMO_PEDIDOS_NO_LOTE);
  });
});
