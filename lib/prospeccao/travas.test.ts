import { describe, expect, it } from "vitest";

import {
  avaliarTravas,
  inicioDaHoraUtc,
  inicioDoDiaUtc,
  jitterDeTermo,
  LIMITES_CONSERVADORES,
} from "./travas";
import { criarProgresso, registrarEncontrados, totalEncontrado } from "./checkpoint";

describe("travas da prospecção Maps", () => {
  it("padrão conservador do plano: 20/h, 100/dia, 1,5 s", () => {
    expect(LIMITES_CONSERVADORES).toEqual({ por_hora: 20, por_dia: 100, jitter_ms: 1500 });
  });

  it("libera abaixo dos dois tetos", () => {
    expect(avaliarTravas(19, 99)).toEqual({ ok: true, motivo: null });
  });

  it("recusa no teto por hora, com motivo visível", () => {
    const d = avaliarTravas(20, 1);
    expect(d.ok).toBe(false);
    expect(d.motivo).toContain("por hora");
  });

  it("recusa no teto diário", () => {
    const d = avaliarTravas(1, 100);
    expect(d.ok).toBe(false);
    expect(d.motivo).toContain("por dia");
  });

  it("jitter fica entre 0 e o teto e aceita 0 (desligado)", () => {
    expect(jitterDeTermo(1500, () => 0)).toBe(0);
    expect(jitterDeTermo(1500, () => 1)).toBe(1500);
    expect(jitterDeTermo(0)).toBe(0);
  });

  it("dia e hora em UTC", () => {
    const d = new Date("2026-11-27T23:30:00-03:00");
    expect(inicioDoDiaUtc(d)).toBe("2026-11-28T00:00:00Z");
    expect(inicioDaHoraUtc(d)).toBe("2026-11-28T02:00:00.000Z");
  });
});

describe("encontrados por termo", () => {
  it("soma sem contador em memória e sobrescreve na retomada", () => {
    let p = criarProgresso(["a", "b"]);
    p = registrarEncontrados(p, "a", 40);
    p = registrarEncontrados(p, "b", 35);
    expect(totalEncontrado(p)).toBe(75);
    p = registrarEncontrados(p, "a", 12); // termo reexecutado
    expect(totalEncontrado(p)).toBe(47);
  });
});
