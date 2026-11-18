import { describe, expect, it } from "vitest";

import {
  interpretarConfiguracao,
  organizacaoDevida,
  PADROES_SENTINEL,
} from "./config";

describe("configuração do Sentinel", () => {
  it("ausência de linha = defaults ativos (não é 'desligado')", () => {
    expect(interpretarConfiguracao(null)).toEqual(PADROES_SENTINEL);
    expect(interpretarConfiguracao(undefined)).toEqual(PADROES_SENTINEL);
  });

  it("normaliza limites absurdos em vez de aceitar lixo", () => {
    const c = interpretarConfiguracao({
      ativo: true,
      intervalo_minutos: 1,
      retencao_dias: 2,
      limite_ocorrencias: 999_999,
      detectores_desativados: ["fiscal.nota_rejeitada", 42 as unknown as string],
      ultima_execucao_em: null,
    });
    expect(c.intervaloMinutos).toBe(PADROES_SENTINEL.intervaloMinutos);
    expect(c.retencaoDias).toBe(PADROES_SENTINEL.retencaoDias);
    expect(c.limiteOcorrencias).toBe(2000);
    expect(c.detectoresDesativados).toEqual(["fiscal.nota_rejeitada"]);
  });

  it("intervalo: org sem execução está devida; recente não; vencida sim", () => {
    const agora = Date.parse("2026-11-18T12:00:00.000Z");
    expect(organizacaoDevida(null, 360, agora)).toBe(true);
    expect(
      organizacaoDevida(new Date(agora - 60 * 60_000).toISOString(), 360, agora),
    ).toBe(false);
    expect(
      organizacaoDevida(new Date(agora - 361 * 60_000).toISOString(), 360, agora),
    ).toBe(true);
    expect(organizacaoDevida("data-invalida", 360, agora)).toBe(true);
  });
});
