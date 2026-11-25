import { describe, expect, it } from "vitest";

import { janelaDeColeta, validarDataBr } from "../../workers/mercos/janela.mjs";

const AGORA = Date.parse("2026-11-24T12:00:00Z");

describe("janela de coleta do Mercos — override só para recuperação", () => {
  it("sem as vars, comportamento atual: data derivada do último importado", () => {
    const j = janelaDeColeta({
      agoraMs: AGORA,
      ultimoCreatedAt: "2026-11-20T12:00:00.000Z",
    });
    expect(j.recuperacao).toBe(false);
    expect(j.de).toBe("19/11/2026");
    expect(j.ate).toBe("25/11/2026");
  });

  it("sem último importado e sem override, usa os dias padrão", () => {
    const j = janelaDeColeta({ agoraMs: AGORA });
    expect(j.recuperacao).toBe(false);
    expect(j.de).toBe("24/10/2026");
  });

  it("com MERCOS_DE/ATE, a janela é a informada e marca recuperação", () => {
    const j = janelaDeColeta({
      agoraMs: AGORA,
      ultimoCreatedAt: "2026-11-20T12:00:00.000Z",
      overrideDe: "01/01/2026",
      overrideAte: "28/02/2026",
    });
    expect(j).toEqual({ de: "01/01/2026", ate: "28/02/2026", recuperacao: true });
  });

  it("override incompleto ou data inválida falha fechado", () => {
    expect(() => janelaDeColeta({ agoraMs: AGORA, overrideDe: "01/01/2026" })).toThrow(/juntos/);
    expect(() => janelaDeColeta({ agoraMs: AGORA, overrideDe: "31/02/2026", overrideAte: "28/02/2026" }))
      .toThrow(/DD\/MM\/AAAA/);
    expect(validarDataBr("29/02/2024")).toBe(true);
    expect(validarDataBr("29/02/2026")).toBe(false);
  });
});
