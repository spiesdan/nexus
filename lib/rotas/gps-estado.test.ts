import { describe, expect, it } from "vitest";

import { estadoDoGps } from "./gps-estado";

const AGORA = Date.parse("2026-11-22T12:00:00.000Z");
const t = (s: string) => s;
const hora = () => "09:00";

describe("estado do GPS no escritório", () => {
  it("sem posição: nunca inventa 'online'", () => {
    expect(estadoDoGps(null, AGORA, 15, hora, t)).toBeNull();
  });

  it("posição recente: só a hora da última", () => {
    const em = new Date(AGORA - 3 * 60_000).toISOString();
    expect(estadoDoGps(em, AGORA, 15, hora, t)).toBe("Última posição às 09:00");
  });

  it("sem sinal: diz há quantos minutos", () => {
    const em = new Date(AGORA - 42 * 60_000).toISOString();
    expect(estadoDoGps(em, AGORA, 15, hora, t)).toBe(
      "Última posição às 09:00 · sem sinal há 42 min",
    );
  });

  it("o limite vem do parâmetro, não de número escrito na tela", () => {
    const em = new Date(AGORA - 20 * 60_000).toISOString();
    expect(estadoDoGps(em, AGORA, 30, hora, t)).toBe("Última posição às 09:00");
    expect(estadoDoGps(em, AGORA, 10, hora, t)).toContain("sem sinal há 20 min");
  });
});
