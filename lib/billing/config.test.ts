import { describe, expect, it } from "vitest";

import {
 BILLING_LIVE_KEY_ERROR,
 lerConfiguracaoBilling,
 validarConfiguracaoStripe,
} from "./config";

describe("configuração da cobrança", () => {
  it("chave live derruba o boot (sk_live e rk_live)", () => {
    expect(() => validarConfiguracaoStripe({ STRIPE_SECRET_KEY: "sk_live_x" })).toThrow(
      BILLING_LIVE_KEY_ERROR,
    );
    expect(() => validarConfiguracaoStripe({ STRIPE_SECRET_KEY: "rk_live_x" })).toThrow(
      BILLING_LIVE_KEY_ERROR,
    );
  });

  it("modo de teste é o padrão e STRIPE_TEST_MODE=false é recusado", () => {
    expect(validarConfiguracaoStripe({ STRIPE_SECRET_KEY: "sk_test_x" })).toBeUndefined();
    expect(() => validarConfiguracaoStripe({ STRIPE_TEST_MODE: "false" })).toThrow(
      /modo de teste obrigatório/,
    );
    expect(lerConfiguracaoBilling({}).testMode).toBe(true);
  });

  it("kill-switch do gate ligado por padrão; etapas padrão D-3/D-2/D-1", () => {
    const c = lerConfiguracaoBilling({});
    expect(c.killSwitchGate).toBe(true);
    expect(c.noticeDias).toEqual([3, 2, 1]);
    expect(lerConfiguracaoBilling({ BILLING_NOTICE_DIAS: "5,1" }).noticeDias).toEqual([5, 1]);
  });
});
