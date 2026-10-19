import { describe, expect, it } from "vitest";

import {
  dentroDeAlgumaJanela,
  dentroDoPeriodo,
  inicioDoDiaNoFuso,
  podeEnviarAgora,
  type JanelaDoDia,
} from "./agendamento";

/**
 * O fuso é o da ORGANIZAÇÃO, nunca UTC: os instantes abaixo são escolhidos
 * para dar 12:30 e 14:00 de São Paulo (UTC-3) e provar isso.
 */
const SP = "America/Sao_Paulo";
/** 12:30 local = 15:30Z. */
const MEIO_DIA_E_MEIA = "2026-10-19T15:30:00.000Z";
/** 14:00 local = 17:00Z. */
const DUAS_DA_TARDE = "2026-10-19T17:00:00.000Z";
const JANELAS: JanelaDoDia[] = [
  { inicio: "07:00", fim: "12:00" },
  { inicio: "13:00", fim: "19:00" },
];

describe("dentroDoPeriodo", () => {
  it("aceita o dia dentro das duas pontas (inclusivas)", () => {
    expect(dentroDoPeriodo("2026-10-19", "2026-10-19", "2026-10-23")).toBe(true);
    expect(dentroDoPeriodo("2026-10-23", "2026-10-19", "2026-10-23")).toBe(true);
  });

  it("recusa antes e depois", () => {
    expect(dentroDoPeriodo("2026-10-18", "2026-10-19", "2026-10-23")).toBe(false);
    expect(dentroDoPeriodo("2026-10-24", "2026-10-19", "2026-10-23")).toBe(false);
  });

  it("sem limites, todo dia está dentro", () => {
    expect(dentroDoPeriodo("2026-10-19", null, null)).toBe(true);
  });
});

describe("dentroDeAlgumaJanela", () => {
  it("12:30 local está no buraco entre as janelas → false", () => {
    expect(dentroDeAlgumaJanela(MEIO_DIA_E_MEIA, SP, JANELAS)).toBe(false);
  });

  it("14:00 local está na janela da tarde → true", () => {
    expect(dentroDeAlgumaJanela(DUAS_DA_TARDE, SP, JANELAS)).toBe(true);
  });

  it("lista vazia = sem restrição de horário", () => {
    expect(dentroDeAlgumaJanela(MEIO_DIA_E_MEIA, SP, [])).toBe(true);
  });
});

describe("inicioDoDiaNoFuso", () => {
  it("03:00Z de 19/10 é a meia-noite de 19/10 em São Paulo", () => {
    // O intervalo NÃO é contado em UTC: em UTC a meia-noite seria 00:00Z, e a
    // cota do dia viraria às 21h locais (UTC-3) — antes da meia-noite do dono.
    expect(inicioDoDiaNoFuso(MEIO_DIA_E_MEIA, SP)).toBe("2026-10-19T03:00:00.000Z");
  });

  it("fuso ausente degrada para o padrão sem lançar", () => {
    expect(() => inicioDoDiaNoFuso(MEIO_DIA_E_MEIA, null)).not.toThrow();
  });
});

describe("podeEnviarAgora", () => {
  const base = {
    agoraIso: DUAS_DA_TARDE,
    fuso: SP,
    janelas: JANELAS,
    dataInicio: "2026-10-19",
    dataFim: "2026-10-23",
    ultimoEnvioAt: null as string | null,
    espacoMs: 60_000,
    enviadosHoje: 0,
    limiteDiario: 50,
  };

  it("dentro de tudo → pode", () => {
    expect(podeEnviarAgora(base)).toEqual({ pode: true });
  });

  it("fora do período", () => {
    expect(podeEnviarAgora({ ...base, dataInicio: "2026-10-20" })).toEqual({
      pode: false,
      motivo: "fora_do_periodo",
    });
  });

  it("fora da janela (12:30)", () => {
    expect(podeEnviarAgora({ ...base, agoraIso: MEIO_DIA_E_MEIA })).toEqual({
      pode: false,
      motivo: "fora_da_janela",
    });
  });

  it("cota do dia estourada tem precedência sobre o intervalo", () => {
    expect(podeEnviarAgora({ ...base, enviadosHoje: 50, limiteDiario: 50 })).toEqual({
      pode: false,
      motivo: "cota_do_dia",
    });
  });

  it("intervalo: último envio 30s atrás com espaçamento de 60s", () => {
    const trintaSegundosAtras = new Date(Date.parse(DUAS_DA_TARDE) - 30_000).toISOString();
    expect(podeEnviarAgora({ ...base, ultimoEnvioAt: trintaSegundosAtras })).toEqual({
      pode: false,
      motivo: "intervalo",
    });
  });

  it("último envio 61s atrás já libera", () => {
    const sessentaUm = new Date(Date.parse(DUAS_DA_TARDE) - 61_000).toISOString();
    expect(podeEnviarAgora({ ...base, ultimoEnvioAt: sessentaUm })).toEqual({ pode: true });
  });
});
