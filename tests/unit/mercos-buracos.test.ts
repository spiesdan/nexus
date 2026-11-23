import { describe, expect, it } from "vitest";

// @ts-expect-error — módulo ESM do worker, sem declaração TS
import { buracosParaReprocessar } from "../../workers/mercos/buracos.mjs";

describe("varredura de buracos do Mercos", () => {
  it("encontra os quatro números vistos e nunca importados", () => {
    expect(
      buracosParaReprocessar({
        vistosNoColetor: [19668, 19669, 19670, 19671, 19672, 19673],
        numerosNoBanco: [19668, 19673],
        aPartirDe: 19668,
        limite: 50,
      }),
    ).toEqual([19672, 19671, 19670, 19669]);
  });

  it("respeita o limite e não devolve número abaixo do cursor", () => {
    expect(
      buracosParaReprocessar({
        vistosNoColetor: [10, 11, 12, 13],
        numerosNoBanco: [],
        aPartirDe: 11,
        limite: 2,
      }),
    ).toEqual([13, 12]);
  });

  it("sem buraco devolve vazio", () => {
    expect(
      buracosParaReprocessar({
        vistosNoColetor: [1, 2],
        numerosNoBanco: [1, 2],
      }),
    ).toEqual([]);
  });
});
