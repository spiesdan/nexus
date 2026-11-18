import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));

import { CorrecaoDeConversa } from "@/app/app/sentinel/_correcao_conversa";
import type { OcorrenciaSentinel } from "@/app/app/sentinel/_tipos";
import { apiClient } from "@/lib/api/client";

const ATENDENTE = "a0280000-1111-4000-8000-000000000001";
const ASSIGNED = "2026-11-08T12:00:00.000+00:00";
const HASH = "c".repeat(64);

function ocorrencia(over: Partial<OcorrenciaSentinel> = {}): OcorrenciaSentinel {
  return {
    id: "oc-conv-1",
    regra: "operacao.conversa_claim_parado",
    categoria: "operacao",
    entidade_tipo: "conversations",
    entidade_id: "conv-1",
    titulo: "Conversa parada",
    resumo: "Sem mensagem.",
    causa_provavel: "Claim sem TTL.",
    severidade: "media",
    estado: "aprovada",
    evidencia: {},
    recomendacao: null,
    href: "/app/inbox",
    primeira_vista_em: ASSIGNED,
    ultima_vista_em: ASSIGNED,
    vezes_vista: 1,
    recorrencias: 0,
    responsavel_user_id: null,
    ignorada_motivo: null,
    motivo_encerramento: null,
    encerrada_em: null,
    created_at: ASSIGNED,
    updated_at: ASSIGNED,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Correção de conversa — tela", () => {
  it("não aparece para regra alheia", () => {
    render(
      <CorrecaoDeConversa
        ocorrencia={ocorrencia({ regra: "fiscal.nota_rejeitada", entidade_tipo: "invoices" })}
        onAtualizar={vi.fn()}
      />,
    );
    expect(screen.queryByText("Liberar conversa parada (revisável)")).not.toBeInTheDocument();
  });

  it("simula, exige motivo+confirmação e só então executa", async () => {
    vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
      if (url.endsWith("/simular")) {
        return {
          data: {
            elegivel: true,
            plano: {
              conversaId: "conv-1",
              antes: { atendente_id: ATENDENTE, assigned_at: ASSIGNED },
              depois: { status: "open", atendente_id: null, assigned_at: null },
              hash: HASH,
              resumo: "Devolver para a fila.",
            },
            conversa: { id: "conv-1", status: "claimed" },
          },
        } as never;
      }
      return { data: {} } as never;
    });
    const atualizar = vi.fn();
    render(<CorrecaoDeConversa ocorrencia={ocorrencia()} onAtualizar={atualizar} />);

    fireEvent.click(screen.getByRole("button", { name: "Simular liberação" }));
    await waitFor(() => expect(screen.getByText("Fila da organização · sem responsável")).toBeInTheDocument());

    const executar = screen.getByRole("button", { name: "Liberar conversa" });
    expect(executar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo (obrigatório, fica no histórico)"), {
      target: { value: "responsável de férias" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(executar).toBeEnabled();

    fireEvent.click(executar);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/api/v1/sentinel/occurrences/oc-conv-1/correcao/conversa",
        {
          confirmado: true,
          motivo: "responsável de férias",
          antes_atendente: ATENDENTE,
          antes_assigned_at: ASSIGNED,
          hash: HASH,
        },
      ),
    );
    await waitFor(() => expect(atualizar).toHaveBeenCalled());
  });

  it("corrigida oferece devolver o claim", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
    const atualizar = vi.fn();
    render(
      <CorrecaoDeConversa
        ocorrencia={ocorrencia({ estado: "corrigida" })}
        onAtualizar={atualizar}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Devolver o claim ao responsável" }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/api/v1/sentinel/occurrences/oc-conv-1/correcao/conversa/reverter",
        {},
      ),
    );
    await waitFor(() => expect(atualizar).toHaveBeenCalled());
  });
});
