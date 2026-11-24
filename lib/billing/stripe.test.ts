import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { assinaturaValida, corpoForm, lerConfigStripe } from "./stripe";

function assinar(corpo: string, segredo: string, timestamp: number): string {
  return `t=${timestamp},v1=${createHmac("sha256", segredo).update(`${timestamp}.${corpo}`).digest("hex")}`;
}

describe("Stripe: modo de teste e assinatura", () => {
  it("chave live é recusada na leitura da configuração", () => {
    expect(() => lerConfigStripe({ STRIPE_SECRET_KEY: "sk_live_x" })).toThrow(/live recusada/);
  });

  it("assinatura sobre o corpo bruto bate", () => {
    const agora = 1_700_000_000_000;
    const corpo = '{"id":"evt_1"}';
    expect(assinaturaValida({ corpo, assinatura: assinar(corpo, "segredo", agora / 1000), segredo: "segredo", agoraMs: agora })).toBe(true);
  });

  it("corpo alterado é recusado", () => {
    const agora = 1_700_000_000_000;
    const assinatura = assinar('{"id":"evt_1"}', "segredo", agora / 1000);
    expect(assinaturaValida({ corpo: '{"id":"evt_2"}', assinatura, segredo: "segredo", agoraMs: agora })).toBe(false);
  });

  it("replay fora da janela é recusado", () => {
    const agora = 1_700_000_000_000;
    const assinatura = assinar("x", "segredo", 1_699_900_000);
    expect(assinaturaValida({ corpo: "x", assinatura, segredo: "segredo", agoraMs: agora })).toBe(false);
  });

  it("sem segredo ou sem assinatura falha fechado", () => {
    expect(assinaturaValida({ corpo: "x", assinatura: "", segredo: "segredo" })).toBe(false);
    expect(assinaturaValida({ corpo: "x", assinatura: "t=1,v1=aa", segredo: "" })).toBe(false);
  });

  it("corpo form ignora vazio", () => {
    expect(corpoForm({ a: "1", b: "", c: undefined })).toBe("a=1");
  });
});
