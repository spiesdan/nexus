import { describe, expect, it } from "vitest";

import { deveSuspender, eventoEstaAtrasado, statusDaFatura } from "./webhook-logica";

describe("webhook Stripe: ordem e suspensão", () => {
  it("evento antigo não reaplica estado", () => {
    expect(eventoEstaAtrasado(new Date("2026-11-01"), new Date("2026-11-02"))).toBe(true);
    expect(eventoEstaAtrasado(new Date("2026-11-03"), new Date("2026-11-02"))).toBe(false);
    expect(eventoEstaAtrasado(null, null)).toBe(false);
  });

  it("tipo de evento define status da fatura", () => {
    expect(statusDaFatura("invoice.paid")).toBe("paid");
    expect(statusDaFatura("invoice.payment_failed")).toBe("unpaid");
    expect(statusDaFatura("invoice.payment_action_required")).toBe("action_required");
    expect(statusDaFatura("customer.subscription.deleted")).toBeNull();
  });

  it("suspende só fatura vencida e não paga, sem tolerância", () => {
    const agora = new Date("2026-11-24T12:00:00Z");
    expect(deveSuspender("unpaid", new Date("2026-11-23T23:59:59Z"), agora)).toBe(true);
    expect(deveSuspender("unpaid", new Date("2026-11-25T00:00:00Z"), agora)).toBe(false);
    expect(deveSuspender("paid", new Date("2026-11-01"), agora)).toBe(false);
    expect(deveSuspender("unpaid", null, agora)).toBe(false);
  });
});
