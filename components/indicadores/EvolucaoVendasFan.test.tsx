/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EvolucaoVendasFan } from "@/components/indicadores/EvolucaoVendasFan";
import type { DadosIndicadores } from "@/app/app/indicadores/_indicadores";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

function dados(): DadosIndicadores {
  const serie = Array.from({ length: 30 }, (_, i) => ({
    dia: i + 1,
    vendas: 10000,
    vendaAc: (i + 1) * 10000,
    metaAc: (i + 1) * 12000,
    mesAnt: (i + 1) * 9000,
    mesAno: (i + 1) * 8000,
    projecao: (i + 1) * 11000,
  }));
  return {
    mes: "2026-08",
    rotuloMes: "Agosto de 2026",
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
  };
}

describe("EvolucaoVendasFan", () => {
  it("monta o leque com legenda e eixo de dias", () => {
    render(
      <IdiomaProvider locale="pt-BR">
        <EvolucaoVendasFan dados={dados()} comparar />
      </IdiomaProvider>,
    );
    expect(screen.getByRole("group", { name: /Evolução de venda/ })).toBeInTheDocument();
    expect(screen.getByText("Vendas no mês")).toBeInTheDocument();
    expect(screen.getByText("Previsão de vendas")).toBeInTheDocument();
    expect(screen.getByText("Mês passado")).toBeInTheDocument();
  });

  it("sem dados válidos não renderiza nada (legado assume)", () => {
    const d = dados();
    d.serie = d.serie.map((s) => ({ ...s, vendas: 0, vendaAc: 0 }));
    d.previsaoMes = 0;
    const { container } = render(
      <IdiomaProvider locale="pt-BR">
        <EvolucaoVendasFan dados={d} comparar={false} />
      </IdiomaProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
