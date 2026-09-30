import { describe, expect, it } from "vitest";

import { acumuladoDiario } from "@/lib/comercial/contexto-indicadores";

/**
 * A comparação da legenda ("Mês passado"/"Ano passado") é o acumulado por dia
 * de um mês extra, com a MESMA convenção da grade de `montarGradeDoMes`:
 * índice i = dia i+1. Home e Indicadores compartilham este laço de propósito —
 * as telas não podem divergir do que a comparação vale.
 */
describe("acumuladoDiario", () => {
  it("acumula por posição e entrega 'dias' entradas", () => {
    const serie = [
      { dia: "2026-08-01", cents: 1000 },
      { dia: "2026-08-02", cents: 2500 },
      { dia: "2026-08-03", cents: 500 },
    ];
    expect(acumuladoDiario(serie, 3)).toEqual([1000, 3500, 4000]);
  });

  it("dias maior que a série vira 0 no resto (mês curto na comparação)", () => {
    const serie = [{ dia: "2026-02-28", cents: 700 }];
    expect(acumuladoDiario(serie, 3)).toEqual([700, 700, 700]);
  });

  it("sem série (mês sem linhas) devolve tudo em 0", () => {
    expect(acumuladoDiario(undefined, 3)).toEqual([0, 0, 0]);
  });

  it("série vazia devolve tudo em 0", () => {
    expect(acumuladoDiario([], 2)).toEqual([0, 0]);
  });
});
