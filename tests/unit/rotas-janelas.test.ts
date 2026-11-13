/**
 * JANELAS DE ENTREGA — a conversão que faz "14h às 16h" virar restrição.
 *
 * Dois erros que estes testes travam:
 * 1. inventar uma hora de saída quando a carga não tem (`saida_prevista`
 *    nula): a janela não é aplicada e a resposta DECLARA, não chuta;
 * 2. janela que termina antes da saída ser tratada como "sem janela" em
 *    silêncio — é dado inconsistente e precisa de correção humana.
 */
import { describe, expect, it } from "vitest";

import {
  converterJanelaParaSolver,
  type ResultadoDaJanela,
} from "@/lib/expedicao/janelas-solver";
import { horaDoMinuto, horaParaColuna, minutosDoDia } from "@/lib/rotas/janelas";

describe("minutosDoDia / horaDoMinuto", () => {
  it("converte o time do banco em minuto do dia", () => {
    expect(minutosDoDia("00:00:00")).toBe(0);
    expect(minutosDoDia("08:30:00")).toBe(510);
    expect(minutosDoDia("23:59")).toBe(1439);
  });

  it("trata vazio e inválido como ausência de dado", () => {
    expect(minutosDoDia(null)).toBeNull();
    expect(minutosDoDia("")).toBeNull();
    expect(minutosDoDia("24:00")).toBeNull();
    expect(minutosDoDia("08:75")).toBeNull();
    expect(minutosDoDia("oito")).toBeNull();
  });

  it("volta ao relógio com dois dígitos e dá a volta no dia", () => {
    expect(horaDoMinuto(510)).toBe("08:30");
    expect(horaDoMinuto(1439)).toBe("23:59");
    expect(horaDoMinuto(1440)).toBe("00:00");
    expect(horaDoMinuto(1530)).toBe("01:30");
  });

  it("devolve a forma que a coluna time aceita", () => {
    expect(horaParaColuna("07:30")).toBe("07:30:00");
    expect(horaParaColuna("")).toBeNull();
  });
});

describe("converterJanelaParaSolver", () => {
  it("mede a janela a partir da saída", () => {
    const r = converterJanelaParaSolver("10:00:00", "12:00:00", 8 * 60);
    expect(r).toEqual<ResultadoDaJanela>({ estado: "ok", janela: { inicio: 120, fim: 240 } });
  });

  it("janela que começa antes da saída é recortada em zero (não estica a partida)", () => {
    const r = converterJanelaParaSolver("07:00:00", "10:00:00", 8 * 60);
    expect(r).toEqual<ResultadoDaJanela>({ estado: "ok", janela: { inicio: 0, fim: 120 } });
  });

  it("sem janela informada é sem janela — não é janela do dia inteiro", () => {
    expect(converterJanelaParaSolver(null, null, 480)).toEqual({ estado: "sem_janela" });
    expect(converterJanelaParaSolver("10:00", "09:00", 480)).toEqual({ estado: "sem_janela" });
  });

  it("janela que termina antes da saída é 'vencida', não ausência", () => {
    expect(converterJanelaParaSolver("08:00:00", "10:00:00", 18 * 60)).toEqual({
      estado: "vencida",
    });
  });
});
