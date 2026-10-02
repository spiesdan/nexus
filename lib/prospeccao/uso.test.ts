import { describe, expect, it } from "vitest";

import {
  MENSAGEM_ORCAMENTO_ATINGIDO,
  MENSAGEM_ORCAMENTO_PROXIMO,
  alertaDoOrcamento,
  estadoDoOrcamento,
  limiteDiarioAtingido,
} from "@/lib/prospeccao/uso";

describe("estadoDoOrcamento (budget guard da seção 24)", () => {
  it("limite null ou 0 é ausência de teto — não é teto zerado", () => {
    expect(estadoDoOrcamento(12345, null)).toEqual({
      estado: "sem_limite",
      gasto_cents: 12345,
      limite_cents: null,
      pct: 0,
    });
    expect(estadoDoOrcamento(12345, 0).estado).toBe("sem_limite");
  });

  it("abaixo de 80% é ok, com o percentual na régua do painel", () => {
    expect(estadoDoOrcamento(7999, 10000)).toEqual({
      estado: "ok",
      gasto_cents: 7999,
      limite_cents: 10000,
      pct: 79.99,
    });
    expect(estadoDoOrcamento(0, 10000).estado).toBe("ok");
  });

  it("80% avisa, 90% reduz a automação, 100% bloqueia — o exemplo da spec", () => {
    // 2.340 / 10.000 = 23,4% (§21) — e os limiares exatos do §24:
    expect(estadoDoOrcamento(2340, 10000).pct).toBe(23.4);
    expect(estadoDoOrcamento(8000, 10000)).toMatchObject({ estado: "aviso", pct: 80 });
    expect(estadoDoOrcamento(9000, 10000)).toMatchObject({ estado: "reducao", pct: 90 });
    expect(estadoDoOrcamento(10000, 10000)).toMatchObject({ estado: "bloqueio", pct: 100 });
  });

  it("estouro do teto continua bloqueando — o guard nunca fica mudo no corte", () => {
    expect(estadoDoOrcamento(10001, 10000).estado).toBe("bloqueio");
    expect(estadoDoOrcamento(15000, 10000)).toMatchObject({ estado: "bloqueio", pct: 150 });
  });
});

describe("alertaDoOrcamento (o que o painel mostra)", () => {
  it("sem teto e abaixo de 80% não há alerta", () => {
    expect(alertaDoOrcamento(estadoDoOrcamento(99999, null))).toBeNull();
    expect(alertaDoOrcamento(estadoDoOrcamento(7999, 10000))).toBeNull();
  });

  it("aviso e redução mostram o alerta próximo do limite", () => {
    expect(alertaDoOrcamento(estadoDoOrcamento(8000, 10000))).toBe(MENSAGEM_ORCAMENTO_PROXIMO);
    expect(alertaDoOrcamento(estadoDoOrcamento(9500, 10000))).toBe(MENSAGEM_ORCAMENTO_PROXIMO);
  });

  it("em 100% a mensagem é literal da spec — a mesma que o motor e o POST devolvem", () => {
    expect(alertaDoOrcamento(estadoDoOrcamento(10000, 10000))).toBe(MENSAGEM_ORCAMENTO_ATINGIDO);
    expect(MENSAGEM_ORCAMENTO_ATINGIDO).toBe(
      "Limite de prospecção atingido. Aumente o limite ou aguarde a renovação.",
    );
  });
});

describe("limiteDiarioAtingido (DailyProspectingLimits, seção 20)", () => {
  it("debaixo do teto o tick roda; no teto e acima ele para", () => {
    expect(limiteDiarioAtingido(1999, 2000)).toBe(false);
    expect(limiteDiarioAtingido(2000, 2000)).toBe(true);
    expect(limiteDiarioAtingido(2001, 2000)).toBe(true);
  });
});
