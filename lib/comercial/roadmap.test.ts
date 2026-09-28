import { describe, expect, it } from "vitest";

import { montarRoadmap, rotuloAnoMes } from "@/lib/comercial/roadmap";

describe("roadmap (12 meses, dados reais)", () => {
  it("rotula jan/26", () => {
    expect(rotuloAnoMes("2026-01")).toBe("jan/26");
  });

  it("passado é fechado, atual projeta, futuro zera", () => {
    const meses = montarRoadmap({
      ano: "2026",
      mesAtual: "2026-03",
      realizadoPorMes: new Map([
        ["2026-01", 100000],
        ["2026-02", 50000],
        ["2026-03", 30000],
      ]),
      metaPorMes: new Map([
        ["2026-01", 100000],
        ["2026-03", 100000],
      ]),
      projecaoMesAtual: { projetado_cents: 90000, metodo: "ritmo" },
    });
    expect(meses).toHaveLength(12);
    const jan = meses[0]!;
    expect(jan.status).toBe("fechado");
    expect(jan.atingido_pct).toBe(100);
    const mar = meses[2]!;
    expect(mar.status).toBe("andamento");
    expect(mar.atingido_pct).toBe(90);
    expect(mar.metodo_projecao).toBe("ritmo");
    const dez = meses[11]!;
    expect(dez.status).toBe("futuro");
    expect(dez.realizado_cents).toBe(0);
    expect(dez.atingido_pct).toBeNull();
  });

  it("sem meta, sem percentual (nunca divide por zero)", () => {
    const meses = montarRoadmap({
      ano: "2026",
      mesAtual: "2026-01",
      realizadoPorMes: new Map([["2026-01", 100]]),
      metaPorMes: new Map(),
      projecaoMesAtual: null,
    });
    expect(meses[0]!.atingido_pct).toBeNull();
  });
});
