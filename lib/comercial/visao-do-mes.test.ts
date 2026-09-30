import { describe, expect, it } from "vitest";

import type { AgregadosIndicadores } from "./contexto-indicadores";
import { montarGradeDoMes } from "./visao-do-mes";

/**
 * A PROJEÇÃO da grade é a linha de RITMO do mês: `taxaDiaria × dia`, do dia 1
 * ao último, em todo mês que já começou. As medições que este arquivo trava:
 *
 * 1. no último dia do mês a série vem INTEIRA — foi o report de 2026-09-30
 *    (mês corrente sem dias futuros devolvia tudo null e o KPI caía);
 * 2. por construção a ritmo passa exatamente pelo acumulado de hoje
 *    (taxa × diasDecorridos = o vendido até aqui) e termina em `previsaoMes`;
 * 3. mês fechado também tem ritmo — a linha vira a régua do médio até o
 *    total final;
 * 4. mês que ainda não começou não tem ritmo (tudo null), e sem venda
 *    nenhuma o ritmo é zero — número de dado, não de inventado.
 */

/** Série diária sintética com TODOS os dias do mês (a fonte real faz igual). */
function ag(mes: string, vendasPorDia: number[]): AgregadosIndicadores {
  const serieDiaria = vendasPorDia.map((cents, i) => ({
    dia: `${mes}-${String(i + 1).padStart(2, "0")}`,
    cents,
  }));
  return {
    mes,
    vendidoMes: vendasPorDia.reduce((s, v) => s + v, 0),
    qtdMes: vendasPorDia.filter((v) => v > 0).length,
    serieDiaria,
    metaLoja: null,
    metasVendedores: {},
    ranking: [],
    carteira: { ativos: 0, inativosRecentes: 0, inativosAntigos: 0, prospects: 0, cicloDias: 0 },
    positivacao: { compraram: 0, base: 0 },
    abc: [],
    faturado: 0,
    naoFaturado: 0,
    seriesExtras: {},
  };
}

/** `n` dias vendendo `porDia` centavos. */
function iguais(n: number, porDia: number): number[] {
  return new Array(n).fill(porDia);
}

describe("a linha de ritmo do mês", () => {
  it("no último dia do mês corrente a série vem INTEIRA — nada de null na reta", () => {
    const g = montarGradeDoMes({
      agregados: ag("2026-09", iguais(30, 10000)),
      mes: "2026-09",
      hoje: "2026-09-30",
    });
    expect(g.projecaoAc).toHaveLength(30);
    expect(g.projecaoAc.every((v) => v != null)).toBe(true);
  });

  it("passa exatamente pelo acumulado de hoje e termina em previsaoMes", () => {
    // 10 dias × 20000 = 200000 vendidos; ritmo = 20000/dia → 30 dias = 600000.
    const vendas = [...iguais(10, 20000), ...iguais(20, 0)];
    const g = montarGradeDoMes({
      agregados: ag("2026-09", vendas),
      mes: "2026-09",
      hoje: "2026-09-10",
    });
    expect(g.diasDecorridos).toBe(10);
    expect(g.previsaoMes).toBe(600000);
    // O ponto de HOJE da ritmo É o realizado de hoje (200000).
    expect(g.projecaoAc[9]).toBe(200000);
    expect(g.projecaoAc[9]).toBe(g.vendaAc[9]);
    // E o último dia fecha na própria previsão.
    expect(g.projecaoAc[29]).toBe(g.previsaoMes);
  });

  it("o passo da linha é a taxa diária — constante do dia 1 ao último", () => {
    const vendas = [...iguais(10, 20000), ...iguais(20, 0)];
    const g = montarGradeDoMes({
      agregados: ag("2026-09", vendas),
      mes: "2026-09",
      hoje: "2026-09-10",
    });
    for (let i = 1; i < g.projecaoAc.length; i++) {
      const anterior = g.projecaoAc[i - 1];
      const atual = g.projecaoAc[i];
      expect(atual != null && anterior != null).toBe(true);
      expect((atual ?? 0) - (anterior ?? 0)).toBe(20000);
    }
  });

  it("mês fechado: a linha atravessa o mês inteiro e termina no total vendido", () => {
    const vendas = [...iguais(20, 5000), ...iguais(11, 0)];
    const g = montarGradeDoMes({
      agregados: ag("2026-08", vendas),
      mes: "2026-08",
      hoje: "2026-09-30",
    });
    expect(g.projecaoAc).toHaveLength(31);
    expect(g.projecaoAc.every((v) => v != null)).toBe(true);
    expect(g.previsaoMes).toBe(100000);
    expect(g.projecaoAc[30]).toBe(g.previsaoMes);
  });

  it("mês que ainda não começou não tem ritmo — tudo null", () => {
    const g = montarGradeDoMes({
      agregados: ag("2026-10", iguais(31, 0)),
      mes: "2026-10",
      hoje: "2026-09-30",
    });
    expect(g.projecaoAc.every((v) => v == null)).toBe(true);
    expect(g.ehMesAtual).toBe(false);
  });

  it("sem venda nenhuma o ritmo é zero — número de dado, não de inventado", () => {
    const g = montarGradeDoMes({
      agregados: ag("2026-09", iguais(30, 0)),
      mes: "2026-09",
      hoje: "2026-09-15",
    });
    expect(g.projecaoAc.every((v) => v === 0)).toBe(true);
    expect(g.previsaoMes).toBe(0);
  });
});
