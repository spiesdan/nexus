/**
 * O mês de comissão é o mês DO FUSO DA ORGANIZAÇÃO, não o do servidor.
 *
 * A rota `GET /api/v1/commissions?ano_mes=YYYY-MM` montava as bordas em UTC
 * (`2026-11-01T00:00:00Z` a `2026-12-01T00:00:00Z`). Em Brasília isso é 31/10
 * 21h a 30/11 21h: o pedido das 22h do dia 30/11 caía na comissão de dezembro,
 * e o da véspera entrava em novembro. O fechamento do vendedor saía errado por
 * um dia inteiro de pedidos, todo mês.
 *
 * Os casos abaixo são discriminantes: em UTC os dois primeiros falhariam.
 */
import { describe, expect, it } from "vitest";

import { intervaloDoMesNoFuso } from "./visao-do-mes";

describe("intervaloDoMesNoFuso", () => {
  it("novembro em Brasília começa 03:00Z do dia 1 e termina 03:00Z do dia 1 seguinte", () => {
    expect(intervaloDoMesNoFuso("2026-11", "America/Sao_Paulo")).toEqual({
      inicio: "2026-11-01T03:00:00.000Z",
      fim: "2026-12-01T03:00:00.000Z",
    });
  });

  it("um pedido às 22h de 30/11 em Brasília pertence a NOVEMBRO", () => {
    const { inicio, fim } = intervaloDoMesNoFuso("2026-11", "America/Sao_Paulo");
    // 30/11 22h BRT = 01/12 01:00Z — fora do intervalo UTC ingênuo, dentro do certo.
    const pedido = "2026-12-01T01:00:00.000Z";
    expect(pedido >= inicio && pedido < fim).toBe(true);
  });

  it("respeita fuso sem deslocamento (UTC)", () => {
    expect(intervaloDoMesNoFuso("2026-02", "UTC")).toEqual({
      inicio: "2026-02-01T00:00:00.000Z",
      fim: "2026-03-01T00:00:00.000Z",
    });
  });

  it("atravessa fevereiro e ano bissexto sem inventar dia", () => {
    expect(intervaloDoMesNoFuso("2028-02", "America/Sao_Paulo")).toEqual({
      inicio: "2028-02-01T03:00:00.000Z",
      fim: "2028-03-01T03:00:00.000Z",
    });
  });
});
