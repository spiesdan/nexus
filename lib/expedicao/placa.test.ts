import { describe, expect, it } from "vitest";

import { mascaraPlaca, placaEhValida } from "./placa";

describe("placa validada", () => {
  it("aceita Mercos e antiga, com ou sem máscara", () => {
    for (const valor of ["ABC1D23", "abc-1d23", "ABC-1234", "ABC1234"]) {
      expect(placaEhValida(valor)).toBe(true);
    }
  });

  it("recusa grafias erradas que virariam veículos distintos", () => {
    for (const valor of ["fiorino", "FIONO", "AB1234", "ABC12D34", "", null]) {
      expect(placaEhValida(valor)).toBe(false);
    }
  });

  it("máscara normaliza a grafia", () => {
    expect(mascaraPlaca("abc1d23")).toBe("ABC-1D23");
    expect(mascaraPlaca("abc1234")).toBe("ABC-1234");
  });
});
