/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EvolucaoVendas, diaDoPixel } from "@/components/indicadores/EvolucaoVendas";
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

function renderCard(over: Partial<DadosIndicadores> = {}, comparar = false) {
  const onCompararChange = vi.fn();
  const utils = render(
    <IdiomaProvider locale="pt-BR">
      <EvolucaoVendas dados={{ ...dados(), ...over }} comparar={comparar} onCompararChange={onCompararChange} />
    </IdiomaProvider>,
  );
  return { ...utils, onCompararChange };
}

describe("EvolucaoVendas", () => {
  it("monta cabeçalho, gráfico, legenda e lateral como no Mercos", () => {
    renderCard();
    expect(screen.getByText("EVOLUÇÃO DE VENDA")).toBeInTheDocument();
    expect(screen.getByText("Vendido no mês")).toBeInTheDocument();
    expect(screen.getByText("Objetivo do mês")).toBeInTheDocument();
    expect(screen.getByText("Necessário vender")).toBeInTheDocument();
    expect(screen.getByText("Vendas no mês")).toBeInTheDocument();
    expect(screen.getByText("Previsão de vendas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Detalhar por vendedor" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Definir metas" })).toBeInTheDocument();
  });

  it("botão Comparar alterna o modo", () => {
    const { onCompararChange } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Comparar" }));
    expect(onCompararChange).toHaveBeenCalledWith(true);
  });

  it("mostra itens de comparativo quando ligado", () => {
    renderCard({}, true);
    expect(screen.getByText("Mês passado")).toBeInTheDocument();
    expect(screen.getByText("Ano passado")).toBeInTheDocument();
  });

  it("sem meta mostra R$ 0,00 e 'Nenhuma meta definida'", () => {
    renderCard({ objetivo: null, pctObjetivo: null, necessarioDia: null });
    expect(screen.getByText("Nenhuma meta definida")).toBeInTheDocument();
    expect(screen.getByText("R$ por dia útil")).toBeInTheDocument();
  });

  it("mês vazio mostra estado vazio em vez de quebrar", () => {
    const d = dados();
    d.serie = [];
    renderCard(d);
    expect(screen.getByText("Sem vendas neste mês ainda.")).toBeInTheDocument();
  });
});

describe("diaDoPixel", () => {
  // Plot: PL=60, PW=652, 30 dias → dia 1 em x=60, dia 30 em x=712 (viewBox 720).
  it("mapeia borda esquerda no dia 1 e direita no último", () => {
    expect(diaDoPixel(60, 720, 30)).toBe(1);
    expect(diaDoPixel(712, 720, 30)).toBe(30);
  });

  it("sempre devolve inteiro dentro do mês", () => {
    for (const px of [0, 59, 61, 300, 500, 711, 713, 900]) {
      const d = diaDoPixel(px, 720, 30);
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(30);
    }
  });

  it("meio do gráfico cai no meio do mês", () => {
    expect(diaDoPixel(386, 720, 30)).toBe(16);
  });
});
