import { describe, expect, it } from "vitest";

import { chaveIdempotencia, decidirCheckout, deveBloquear } from "./checkout-logica";

describe("checkout não cobra duas vezes", () => {
  it("status vivo bloqueia; cancelado/incomplete não", () => {
    for (const status of ["active", "trialing", "past_due", "ACTIVE"]) expect(deveBloquear(status)).toBe(true);
    for (const status of ["canceled", "incomplete", "incomplete_expired", null]) expect(deveBloquear(status)).toBe(false);
  });

  it("org com assinatura ativa: 409, nenhuma sessão criada", () => {
    const d = decidirCheckout({
      assinaturas: [{ status: "active" }], customerId: "cus_existe",
      organizationId: "org-1", priceId: "price_1", agoraMs: 1_700_000_000_000,
    });
    expect(d.pode).toBe(false);
    if (!d.pode) expect(d.motivo).toContain("portal");
  });

  it("org sem assinatura: sessão com customer existente", () => {
    const d = decidirCheckout({
      assinaturas: [], customerId: "cus_VdlMUfPSMMNqIw",
      organizationId: "org-1", priceId: "price_1", agoraMs: 1_700_000_000_000,
    });
    expect(d).toMatchObject({ pode: true, customerId: "cus_VdlMUfPSMMNqIw" });
  });

  it("dois cliques seguidos => UMA chave de idempotência", () => {
    const args = {
      assinaturas: [], customerId: "cus_1", organizationId: "org-1", priceId: "price_1",
    };
    const a = decidirCheckout({ ...args, agoraMs: 1_700_000_010_000 });
    const b = decidirCheckout({ ...args, agoraMs: 1_700_000_020_000 });
    expect(a.pode && b.pode && a.idempotencyKey === b.idempotencyKey).toBe(true);
    // janela seguinte já permite um novo checkout legítimo
    expect(chaveIdempotencia("org-1", "price_1", 1_700_000_200_000)).not.toBe(
      chaveIdempotencia("org-1", "price_1", 1_700_000_010_000),
    );
  });
});
