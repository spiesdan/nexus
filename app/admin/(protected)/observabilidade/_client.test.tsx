import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));

import { ObservabilidadeClient } from "@/app/admin/(protected)/observabilidade/_client";
import { apiClient } from "@/lib/api/client";

function renderizar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ObservabilidadeClient />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function resposta() {
  return {
    data: {
      gerado_em: "2026-11-19T20:00:00.000Z",
      sonda: null,
      serie: {
        amostras: 0,
        rotas: 0,
        primeira_em: null,
        ultima_em: null,
      },
      slos: [
        {
          id: "disponibilidade",
          titulo: "Disponibilidade das rotas quentes",
          formula: "1 − (respostas 5xx / total)",
          janela: "7 dias",
          alvo: "≥ 99,5%",
          unidade: "%",
          valor: null,
          estado: "sem_historico",
          nota: "Sem série histórica consultável.",
        },
        {
          id: "latencia",
          titulo: "Latência das listas",
          formula: "p95 das rotas quentes (2xx)",
          janela: "janelas de 5 min · 7 dias",
          alvo: "≤ 800 ms",
          unidade: "ms",
          valor: null,
          estado: "sem_historico",
          nota: "Sem série histórica consultável.",
        },
        {
          id: "frescor_sentinel",
          titulo: "Frescor da varredura do Sentinel",
          formula: "% de orgs ativas em dia",
          janela: "24 h",
          alvo: "≥ 99%",
          unidade: "%",
          valor: 50,
          estado: "estourado",
          nota: "1/2 organizações em dia.",
          detalhe: { orgs_em_dia: 1, orgs_ativas: 2 },
        },
      ],
    },
  };
}

describe("Observabilidade — cartões de SLO", () => {
  it("mostra os três SLOs e 'sem histórico' onde não há série", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(resposta() as never);
    renderizar();

    await waitFor(() => expect(screen.getByText("Disponibilidade das rotas quentes")).toBeInTheDocument());
    expect(screen.getByText("Latência das listas")).toBeInTheDocument();
    expect(screen.getByText("Frescor da varredura do Sentinel")).toBeInTheDocument();
    expect(screen.getAllByText("sem histórico ainda")).toHaveLength(2);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "A série está ligada, mas nenhuma requisição autenticada passou pelas rotas quentes desde o deploy.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhuma sonda executada ainda.")).toBeInTheDocument();
  });

  it("frescor mostra valor e estado estourado", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(resposta() as never);
    renderizar();

    await waitFor(() => expect(screen.getByText("50%")).toBeInTheDocument());
    expect(screen.getByText("estourado")).toBeInTheDocument();
    expect(screen.getByText("1/2 organizações em dia.")).toBeInTheDocument();
  });
});
