import { describe, expect, it } from "vitest";

import { usarFanEvolucao } from "@/components/indicadores/EvolucaoVendasFan";
import type { DadosIndicadores } from "@/app/app/indicadores/_indicadores";

function base(over: Partial<DadosIndicadores> = {}): DadosIndicadores {
  const serie = Array.from({ length: 30 }, (_, i) => ({
    dia: i + 1,
    vendas: 10000,
    vendaAc: (i + 1) * 10000,
    metaAc: (i + 1) * 12000,
    mesAnt: (i + 1) * 9000,
    mesAno: (i + 1) * 8000,
    projecao: null as number | null,
  }));
  return {
    mes: "2026-09",
    rotuloMes: "Setembro de 2026",
    serie,
    vendidoMes: 3000000,
    qtdMes: 30,
    vendidoHoje: 10000,
    objetivo: 3600000,
    pctObjetivo: 83.3,
    necessarioDia: 50000,
    diasUteisRestantes: 5,
    previsaoMes: 3300000,
    faturado: 2000000,
    naoFaturado: 1000000,
    carteira: {
      ativos: 10,
      inativosRecentes: 1,
      inativosAntigos: 2,
      prospects: 3,
      cicloDias: 30,
      total: 16,
    },
    positivacao: { compraram: 5, base: 10, pct: 50 },
    abc: { faixas: [], total: 0 },
    ranking: [],
    filtroVendedor: "",
    vendedores: [],
    cortado: false,
    ...over,
  };
}

describe("usarFanEvolucao", () => {
  it("aceita mês com acumulado positivo e previsão positiva", () => {
    expect(usarFanEvolucao(base())).toBe(true);
  });

  it("recusa mês zerado (sem acumulado positivo)", () => {
    const d = base();
    d.serie = d.serie.map((s) => ({ ...s, vendas: 0, vendaAc: 0 }));
    d.previsaoMes = 0;
    d.vendidoMes = 0;
    expect(usarFanEvolucao(d)).toBe(false);
  });

  it("recusa previsão zerada mesmo com vendas", () => {
    expect(usarFanEvolucao(base({ previsaoMes: 0 }))).toBe(false);
  });

  it("aceita mês sem objetivo (alvo espelha a previsão)", () => {
    expect(usarFanEvolucao(base({ objetivo: null, pctObjetivo: null }))).toBe(true);
  });

  it("recusa mês inválido", () => {
    expect(usarFanEvolucao(base({ mes: "invalido" }))).toBe(false);
  });
});
