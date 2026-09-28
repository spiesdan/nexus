import { describe, expect, it } from "vitest";

import { montarFluxo } from "@/lib/finance/fluxo";

describe("fluxo de caixa (projeção honesta)", () => {
  it("separa vencido de a vencer e acumula a posição", () => {
    const f = montarFluxo({
      hoje: "2026-09-25",
      dias: 2,
      receber: [
        { vencimento: "2026-09-20", saldo_cents: 1000 },
        { vencimento: "2026-09-25", saldo_cents: 500 },
      ],
      pagar: [{ vencimento: "2026-09-26", saldo_cents: 300 }],
    });
    expect(f.vencido_receber_cents).toBe(1000);
    expect(f.vencido_pagar_cents).toBe(0);
    expect(f.dias[0]).toMatchObject({ dia: "2026-09-25", receber_cents: 500, pagar_cents: 0, acumulado_cents: 1500 });
    expect(f.dias[1]).toMatchObject({ dia: "2026-09-26", liquido_cents: -300, acumulado_cents: 1200 });
  });

  it("sem títulos, série zerada (nunca inventa)", () => {
    const f = montarFluxo({ hoje: "2026-09-25", dias: 3, receber: [], pagar: [] });
    expect(f.vencido_receber_cents).toBe(0);
    expect(f.dias).toHaveLength(3);
    expect(f.dias.every((d) => d.liquido_cents === 0)).toBe(true);
  });

  it("saldo zerado não entra", () => {
    const f = montarFluxo({
      hoje: "2026-09-25",
      dias: 1,
      receber: [{ vencimento: "2026-09-25", saldo_cents: 0 }],
      pagar: [],
    });
    expect(f.dias[0]?.receber_cents).toBe(0);
  });
});
