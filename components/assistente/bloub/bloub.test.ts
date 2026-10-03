import { describe, expect, it } from "vitest";

import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID, type ExpressionId } from "./expressions";
import { BotEngine } from "./engine";
import { DEFAULT_SHAPE, SHAPE_BY_ID } from "./skins";
import { STATE_BY_ID, type StateId } from "./states";

/**
 * Guarda da PORTAGEM do bloub: `AssistenteAvatar` e `BloubBot` usam estes
 * nomes por string. Se alguém trocar a engine copiada por outra versão (ou
 * apagar arquivo do feixe), isto quebra antes, no CI — antes de a página
 * cair num estado silenciosamente errado.
 */
describe("bloub portado — os nomes que o assistente usa existem", () => {
  const ESTADOS: StateId[] = ["idle", "wink"];
  const EXPRESSOES: ExpressionId[] = ["neutre", "attentif", "heureux"];

  it("tem os estados idle e wink", () => {
    for (const estado of ESTADOS) {
      expect(STATE_BY_ID.has(estado), `estado faltando: ${estado}`).toBe(true);
    }
  });

  it("tem as expressões neutre, attentif e heureux", () => {
    for (const expressao of EXPRESSOES) {
      expect(EXPRESSION_BY_ID.has(expressao), `expressão faltando: ${expressao}`).toBe(true);
    }
  });

  it("tem a expressão padrão e a forma padrão", () => {
    expect(EXPRESSION_BY_ID.has(DEFAULT_EXPRESSION)).toBe(true);
    expect(SHAPE_BY_ID.has(DEFAULT_SHAPE)).toBe(true);
  });
});

describe("sample — o motor é puro e devolve frame utilizável", () => {
  it("frame 0 tem corpo, olhos e matriz", () => {
    const motor = new BotEngine(100, "idle", null, EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION) ?? null);
    const frame = motor.sample(0);
    expect(frame.bodyPath.length).toBeGreaterThan(0);
    expect(frame.eyes.length).toBeGreaterThanOrEqual(2);
    for (const olho of frame.eyes) {
      expect(olho.d.length).toBeGreaterThan(0);
      expect(olho.matrix.length).toBeGreaterThan(0);
    }
  });

  it("idle -> wink faz o morph sem lançar", () => {
    const motor = new BotEngine(100, "idle");
    motor.setState("wink", 0);
    expect(() => motor.sample(0.3)).not.toThrow();
    expect(motor.sample(0.3).bodyPath.length).toBeGreaterThan(0);
  });

  it("mira o olhar pela régua do cursor sem tocar no DOM", () => {
    const motor = new BotEngine(100, "idle");
    motor.setLook({ yaw: 16, pitch: -3, mix: 1, spin: 0, wander: 0 }, 0);
    expect(() => motor.sample(0.5)).not.toThrow();
  });
});
