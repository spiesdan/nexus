import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/observabilidade/useSaudeDoMotor", () => ({
  useSaudeDoMotor: vi.fn(),
}));

const atRisk = {
  total: 1,
  counts: { critico: 1, em_risco: 0, em_voo: 0 },
  sem_proximo_passo: [],
  total_sem_proximo_passo: 0,
  items: [
    {
      id: "lead-1",
      title: "Negócio parado",
      contact_id: "contato-1",
      contact_name: "Cliente",
      owner_user_id: null,
      owner_kind: "user",
      owner_agent_id: null,
      owner_agent_name: null,
      assignee_kind: null,
      last_activity_at: "2026-11-01T10:00:00.000Z",
      hours_since_activity: 240,
      risk: "critico",
      in_flight: false,
      next_followup_at: null,
      conversation_id: "conversa-1",
      pipeline_id: "funil-1",
      ia_acao: null,
      ia_confianca: null,
      ia_decidido_em: null,
    },
  ],
};

vi.mock("@/hooks/leads/useAtRiskLeads", () => ({
  useAtRiskLeads: () => ({
    data: atRisk,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { RiskRadarList } from "@/app/app/radar/_components/RiskRadarList";
import { useSaudeDoMotor } from "@/hooks/observabilidade/useSaudeDoMotor";

const saudeMock = vi.mocked(useSaudeDoMotor);

function renderizar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RiskRadarList />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * O defeito que estes testes impedem: a demanda sem sugestão parecer
 * "nada a sugerir" quando o motor caiu. Com motor fora, a linha DIZ que a
 * sugestão está indisponível — e o aviso explica por quê.
 */
describe("RiskRadarList × motor de decisão", () => {
  it("motor indisponível: aviso na tela e chip de indisponível, nunca 'Sugestão:'", () => {
    saudeMock.mockReturnValue({
      data: {
        estado: "indisponivel",
        ultima_falha: "2026-11-20T10:00:00.000Z",
        detalhe: "fetch failed",
        falhas: 17,
      },
    } as never);

    renderizar();

    expect(screen.getByTestId("aviso-motor-indisponivel").textContent).toContain(
      "motor de decisão não respondeu",
    );
    expect(screen.getByTestId("radar-sugestao-indisponivel").textContent).toBe(
      "Sugestão indisponível",
    );
    // O chip de sugestão real não existe — e não há texto que prometa sugestão.
    expect(screen.queryByTestId("radar-sugestao")).toBeNull();
  });

  it("motor ok: sem aviso e sem chip de indisponível", () => {
    saudeMock.mockReturnValue({
      data: {
        estado: "ok",
        ultima_falha: "2026-11-19T10:00:00.000Z",
        detalhe: null,
        falhas: null,
      },
    } as never);

    renderizar();

    expect(screen.queryByTestId("aviso-motor-indisponivel")).toBeNull();
    expect(screen.queryByTestId("radar-sugestao-indisponivel")).toBeNull();
  });
});
