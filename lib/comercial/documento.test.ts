import { describe, expect, it } from "vitest";

import { rotuloDoDocumento } from "./documento";

describe("rotuloDoDocumento", () => {
  it("tipo declarado manda", () => {
    expect(rotuloDoDocumento("F", "12345678000199")).toBe("CPF");
    expect(rotuloDoDocumento("J", "12345678901")).toBe("CNPJ");
  });

  it("sem tipo, 11 dígitos é CPF — o defeito do impresso antigo", () => {
    // Medido no pedido 18458: o cadastro não tinha `tipo_pessoa` e o CPF
    // saía rotulado como CNPJ.
    expect(rotuloDoDocumento(null, "08929983936")).toBe("CPF");
    expect(rotuloDoDocumento(undefined, "089.299.839-36")).toBe("CPF");
  });

  it("sem tipo, 14 dígitos é CNPJ", () => {
    expect(rotuloDoDocumento(null, "08929983000136")).toBe("CNPJ");
  });

  it("sem documento, cai em CNPJ (o traço do Mercos)", () => {
    expect(rotuloDoDocumento(null, null)).toBe("CNPJ");
    expect(rotuloDoDocumento(null, "")).toBe("CNPJ");
  });
});
