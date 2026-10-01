/**
 * A janela de execução no FUSO DA ORGANIZAÇÃO (§2, D9).
 *
 * O defeito que estes casos prendem: o cron roda em UTC, e "só manda das 9 às
 * 17:30" interpretado em UTC manda das 6h às 14h30 no relógio de quem lê. Cada
 * instante aqui é escolhido para UM lado da meia-noite ou da borda da janela.
 */
import { describe, expect, it } from "vitest";

import { dentroDaJanela, fusoSeguro, relogioNoFuso } from "./janela";

const BRT = "America/Sao_Paulo"; // UTC-3, sem DST desde 2019

describe("fusoSeguro", () => {
  it("fuso válido passa reto", () => {
    expect(fusoSeguro("America/Sao_Paulo")).toBe("America/Sao_Paulo");
    expect(fusoSeguro("America/Manaus")).toBe("America/Manaus");
  });
  it("fuso inválido/ausente degrada para o padrão — nunca lança no worker", () => {
    expect(fusoSeguro("Marte/Olympus")).toBe(BRT);
    expect(fusoSeguro(null)).toBe(BRT);
    expect(fusoSeguro(undefined)).toBe(BRT);
    expect(fusoSeguro("")).toBe(BRT);
  });
});

describe("relogioNoFuso", () => {
  it("meio-dia UTC = 9h de parede em São Paulo", () => {
    expect(relogioNoFuso("2026-09-30T12:00:00Z", BRT)).toEqual({
      dia: "2026-09-30",
      hora: "09:00",
    });
  });
  it("02h UTC já é o DIA ANTERIOR às 23h — a cota não pode trocar de dia no horário errado", () => {
    expect(relogioNoFuso("2026-09-30T02:00:00Z", BRT)).toEqual({
      dia: "2026-09-29",
      hora: "23:00",
    });
  });
  it("03h UTC = meia-noite de parede (o formato devolve 24:00 em alguns locales e vira 00:00)", () => {
    expect(relogioNoFuso("2026-10-01T03:00:00Z", BRT)).toEqual({
      dia: "2026-10-01",
      hora: "00:00",
    });
  });
  it("fuso inválido no relógio também degrada, não quebra", () => {
    const r = relogioNoFuso("2026-09-30T12:00:00Z", "Nada/Valido");
    expect(r.hora).toBe("09:00");
  });
});

describe("dentroDaJanela", () => {
  const JANELA: [string, string] = ["09:00", "17:30"];

  it("09:00 de parede (12:00 UTC) ABRE a janela — borda inclusiva", () => {
    expect(dentroDaJanela("2026-09-30T12:00:00Z", BRT, ...JANELA)).toBe(true);
  });
  it("17:30 de parede (20:30 UTC) FECHOU — borda final exclusiva", () => {
    expect(dentroDaJanela("2026-09-30T20:30:00Z", BRT, ...JANELA)).toBe(false);
  });
  it("17:29 de parede ainda manda", () => {
    expect(dentroDaJanela("2026-09-30T20:29:00Z", BRT, ...JANELA)).toBe(true);
  });
  it("8h59 de parede ainda NÃO manda", () => {
    expect(dentroDaJanela("2026-09-30T11:59:00Z", BRT, ...JANELA)).toBe(false);
  });
  it("o mesmo instante relido em UTC mudaria o veredito — é o defeito do arquivo", () => {
    // 11:00 UTC = 8h de parede em São Paulo: o fuso da org RECUSA, e uma
    // leitura ingênua em UTC ACEITARIA dentro da janela 09:00–17:30.
    expect(dentroDaJanela("2026-09-30T11:00:00Z", BRT, ...JANELA)).toBe(false);
    expect(dentroDaJanela("2026-09-30T11:00:00Z", "UTC", ...JANELA)).toBe(true);
  });
  it("janela invertida (gravada por caminho torto) é tratada como jeito errado: deixa passar", () => {
    expect(dentroDaJanela("2026-09-30T03:00:00Z", BRT, "17:30", "09:00")).toBe(true);
  });
});
