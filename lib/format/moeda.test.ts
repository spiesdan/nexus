import { describe, expect, it } from "vitest";

import { centavosDeBr } from "./moeda";

describe("centavosDeBr", () => {
  it("lê formato BR com milhar e decimal", () => {
    expect(centavosDeBr("5.000,00")).toBe(500000);
    expect(centavosDeBr("1.234,56")).toBe(123456);
  });

  it("lê sem milhar e inteiro", () => {
    expect(centavosDeBr("5000,00")).toBe(500000);
    expect(centavosDeBr("5000")).toBe(500000);
  });

  it("tolera prefixo R$ e espaços", () => {
    expect(centavosDeBr("R$ 5.000,00")).toBe(500000);
  });

  it("tolera decimal EN sem vírgula", () => {
    expect(centavosDeBr("5000.00")).toBe(500000);
  });

  it("rejeita lixo", () => {
    expect(centavosDeBr("")).toBeNull();
    expect(centavosDeBr("abc")).toBeNull();
    expect(centavosDeBr("12,34,56")).toBeNull();
  });
});
