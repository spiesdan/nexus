import { describe, expect, it } from "vitest";

import { BILLING_GATE_ALLOWLIST, deveBloquearPorCobranca } from "./gate";

const base = {
  suspensoPorBilling: true,
  plataforma: false,
  killSwitchAtivo: true,
};

describe("gate de suspensão por cobrança", () => {
  it("deny-by-default: rota fora da allowlist bloqueia", () => {
    expect(deveBloquearPorCobranca({ ...base, path: "/api/v1/conversations" })).toBe(true);
  });

  it("allowlist é exata: prefixo amplo NÃO abre", () => {
    expect(BILLING_GATE_ALLOWLIST).not.toContain("/api/v1/");
    expect(deveBloquearPorCobranca({ ...base, path: "/api/v1/billing/qualquer" })).toBe(true);
    for (const path of [
      "/account-suspended",
      "/api/v1/billing/checkout",
      "/api/v1/billing/subscription",
      "/api/v1/health",
      "/api/v1/auth/logout",
    ]) {
      expect(deveBloquearPorCobranca({ ...base, path })).toBe(false);
    }
  });

  it("kill-switch desligado devolve acesso sem tocar em estado", () => {
    const desligado = { ...base, path: "/api/v1/conversations", killSwitchAtivo: false };
    expect(deveBloquearPorCobranca(desligado)).toBe(false);
    expect(deveBloquearPorCobranca({ ...desligado, killSwitchAtivo: true })).toBe(true);
  });

  it("plataforma e tenant não suspenso nunca bloqueiam", () => {
    expect(deveBloquearPorCobranca({ ...base, path: "/x", plataforma: true })).toBe(false);
    expect(deveBloquearPorCobranca({ ...base, path: "/x", suspensoPorBilling: false })).toBe(false);
  });
});
