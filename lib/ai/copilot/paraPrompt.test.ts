import { describe, expect, it } from "vitest";

import { blocoDeContexto } from "@/lib/ai/copilot/paraPrompt";

describe("bloco de contexto do copilot", () => {
  it("vazio quando não há página nem resumo", () => {
    expect(blocoDeContexto("", null)).toBe("");
    expect(blocoDeContexto("   ", null)).toBe("");
  });

  it("cita página e resumo, e proíbe inventar", () => {
    const b = blocoDeContexto("/app/contacts/abc", "ciclo mediano 24 dias");
    expect(b).toContain("/app/contacts/abc");
    expect(b).toContain("ciclo mediano 24 dias");
    expect(b).toContain("nunca invente");
  });

  it("corta página e resumo abusivos", () => {
    const b = blocoDeContexto("x".repeat(500), "y".repeat(5000));
    expect(b.length).toBeLessThan(2500);
  });
});
