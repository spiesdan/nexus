import { describe, expect, it } from "vitest";

import { cstatNumerico } from "./cstat";

/**
 * O `cStat` chega como `"232"` (SEFAZ) e como `"SEFAZ_232"` (sidecar). A
 * normalização existe porque comparar só o formato numérico fazia
 * `podeInutilizar` recusar toda rejeição real — e a inutilização automática
 * nunca rodava.
 */
describe("cstatNumerico", () => {
  it("extrai os três dígitos dos dois formatos", () => {
    expect(cstatNumerico("232")).toBe("232");
    expect(cstatNumerico("SEFAZ_232")).toBe("232");
    expect(cstatNumerico("SEFAZ-204")).toBe("204");
    expect(cstatNumerico("  SEFAZ_539  ")).toBe("539");
  });

  it("código local/ambíguo não vira cStat", () => {
    for (const valor of ["VALIDACAO", "XML_INVALIDO", "CERT_NAO_LIDO", "LOTE_RECEBIDO", "SEFAZ_12", ""]) {
      expect(cstatNumerico(valor)).toBe("");
    }
    expect(cstatNumerico(null)).toBe("");
    expect(cstatNumerico(undefined)).toBe("");
  });
});
