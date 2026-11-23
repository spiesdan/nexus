/**
 * A SIMULAÇÃO NA CRIAÇÃO TEM QUE MOSTRAR AS PREMISSAS.
 *
 * Número órfão é o que o dono não consegue questionar. Aqui o cartão da
 * revisão prova que a faixa aparece, que CPM/CTR ausentes são ditos, e que o
 * gasto de mídia está marcado como LANÇAMENTO MANUAL.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SimulacaoDeGastosCard } from "@/components/prospeccao/SimulacaoDeGastosCard";
import { campanhaCreateSchema } from "@/lib/schemas/prospeccao";

afterEach(() => cleanup());

describe("cartão de simulação de gastos", () => {
  it("mostra faixa, premissas ausentes e o aviso de lançamento manual", () => {
    render(
      <SimulacaoDeGastosCard
        celulas={1000}
        custo={{ busca: 18, detalhe: 11 }}
        verbaCents={25000}
        cpm={null}
        ctr={null}
        gastoCents={0}
        limiteCents={null}
      />,
    );
    expect(screen.getByText(/Simulação de gastos/)).toBeTruthy();
    expect(screen.getByText(/mínimo/).textContent).toContain("202,00");
    expect(screen.getByText(/máximo/).textContent).toContain("290,00");
    expect(screen.getByText(/CPM não informado/)).toBeTruthy();
    expect(screen.getByText(/CTR não informado/)).toBeTruthy();
    expect(screen.getByText(/LANÇAMENTO MANUAL/)).toBeTruthy();
  });

  it("mostra override de gerente quando liberado", () => {
    render(
      <SimulacaoDeGastosCard
        celulas={0}
        custo={{ busca: 18, detalhe: 11 }}
        verbaCents={0}
        cpm={25}
        ctr={0.01}
        gastoCents={10000}
        limiteCents={10000}
        liberacao={{ papel: "manager", motivo: "aprovado pelo dono" }}
      />,
    );
    expect(screen.getByText(/override de gerente auditado/)).toBeTruthy();
    expect(screen.getByText(/CPM premissa/)).toBeTruthy();
  });
});

describe("payload de criação da campanha", () => {
  it("aceita os dois orçamentos sem torná-los obrigatórios", () => {
    const base = {
      nome: "Campanha com orçamento",
      categorias: ["Alimentação"],
      cidades: [{ cidade: "Mafra", estado: "SC" }],
    };
    expect(campanhaCreateSchema.safeParse(base).success).toBe(true);
    const comOrcamento = campanhaCreateSchema.safeParse({
      ...base,
      orcamento_prospeccao_cents: 29000,
      orcamento_midia_cents: 25000,
    });
    expect(comOrcamento.success).toBe(true);
    expect(comOrcamento.success && comOrcamento.data.orcamento_midia_cents).toBe(25000);
  });
});
