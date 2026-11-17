import { describe, expect, it } from "vitest";

import { descontoDaDuplicata } from "@/lib/comercial/desconto-da-duplicata";

describe("descontoDaDuplicata", () => {
  it("desconto só em R$ continua fixo", () => {
    expect(
      descontoDaDuplicata({ desconto_cents: 500, desconto_pct: 0, subtotal_cents: 10_000 }),
    ).toEqual({ desconto_cents: 500, desconto_pct: 0 });
  });

  it("desconto só percentual não vira fixo", () => {
    // 10% de 10.000 = 1.000, que é o total gravado. O fixo é zero.
    expect(
      descontoDaDuplicata({ desconto_cents: 1_000, desconto_pct: 10, subtotal_cents: 10_000 }),
    ).toEqual({ desconto_cents: 0, desconto_pct: 10 });
  });

  it("R$ + % separa as duas partes sem dobrar", () => {
    // 500 fixo + 10% de 10.000 (1.000) = 1.500 gravado.
    expect(
      descontoDaDuplicata({ desconto_cents: 1_500, desconto_pct: 10, subtotal_cents: 10_000 }),
    ).toEqual({ desconto_cents: 500, desconto_pct: 10 });
  });

  it("total inconsistente (menor que a parte do percentual) não gera fixo negativo", () => {
    expect(
      descontoDaDuplicata({ desconto_cents: 100, desconto_pct: 10, subtotal_cents: 10_000 }),
    ).toEqual({ desconto_cents: 0, desconto_pct: 10 });
  });

  it("sem desconto nenhum", () => {
    expect(
      descontoDaDuplicata({ desconto_cents: 0, desconto_pct: null, subtotal_cents: 10_000 }),
    ).toEqual({ desconto_cents: 0, desconto_pct: 0 });
  });
});
