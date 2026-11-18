/**
 * A correção aprovada na TELA: simular → ver antes/depois → marcar a
 * confirmação → executar; e reverter quando a ocorrência está corrigida.
 *
 * O que este teste prende é a promessa de produto: o botão de executar NÃO
 * nasce habilitado, e nada é enviado sem o checkbox de revisão. A elegibilidade
 * e o CAS são do servidor (`sentinel-correcao.test.ts` + invariante).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

import { CorrecaoAprovada } from "@/app/app/sentinel/_correcao";
import type { OcorrenciaSentinel } from "@/app/app/sentinel/_tipos";
import { apiClient } from "@/lib/api/client";

const ANTES = "2026-11-18T14:00:00.000+00:00";
const DEPOIS = "2026-11-18T18:00:00.000Z";
const HASH = "b".repeat(64);

function ocorrencia(over: Partial<OcorrenciaSentinel> = {}): OcorrenciaSentinel {
  return {
    id: "oc-1",
    regra: "operacao.job_fila_travado",
    categoria: "operacao",
    entidade_tipo: "job_queue",
    entidade_id: "job-1",
    titulo: "Job preso",
    resumo: "Job parado.",
    causa_provavel: "Worker parado.",
    severidade: "alta",
    estado: "aprovada",
    evidencia: {},
    recomendacao: null,
    href: null,
    primeira_vista_em: ANTES,
    ultima_vista_em: ANTES,
    vezes_vista: 1,
    recorrencias: 0,
    responsavel_user_id: null,
    ignorada_motivo: null,
    motivo_encerramento: null,
    encerrada_em: null,
    created_at: ANTES,
    updated_at: ANTES,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Correção aprovada — tela", () => {
  it("não aparece para regra sem correção suportada", () => {
    render(
      <CorrecaoAprovada
        ocorrencia={ocorrencia({ regra: "fiscal.nota_rejeitada", entidade_tipo: "invoices" })}
        onAtualizar={vi.fn()}
      />,
    );
    expect(screen.queryByText("Correção aprovada (revisável)")).not.toBeInTheDocument();
  });

  it("simula, mostra antes/depois e só habilita executar após a confirmação", async () => {
    vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
      if (url.endsWith("/simular")) {
        return {
          data: {
            elegivel: true,
            plano: {
              jobId: "job-1",
              antes: { run_after: ANTES },
              depois: { run_after: DEPOIS },
              hash: HASH,
              resumo: "Antecipar o job.",
            },
            job: { id: "job-1", kind: "watchdog", status: "pending", attempts: 1, max_attempts: 5 },
          },
        } as never;
      }
      return { data: {} } as never;
    });
    const atualizar = vi.fn();
    render(<CorrecaoAprovada ocorrencia={ocorrencia()} onAtualizar={atualizar} />);

    fireEvent.click(screen.getByRole("button", { name: "Simular correção" }));
    await waitFor(() => expect(screen.getByText("Antes")).toBeInTheDocument());
    expect(screen.getByText("Depois")).toBeInTheDocument();
    const executar = screen.getByRole("button", { name: "Executar correção" });
    expect(executar).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(executar).toBeEnabled();

    fireEvent.click(executar);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/api/v1/sentinel/occurrences/oc-1/correcao",
        { confirmado: true, antes: ANTES, depois: DEPOIS, hash: HASH },
      ),
    );
    await waitFor(() => expect(atualizar).toHaveBeenCalled());
  });

  it("ocorrência corrigida oferece reverter", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
    const atualizar = vi.fn();
    render(
      <CorrecaoAprovada ocorrencia={ocorrencia({ estado: "corrigida" })} onAtualizar={atualizar} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reverter correção" }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/api/v1/sentinel/occurrences/oc-1/correcao/reverter",
        {},
      ),
    );
    await waitFor(() => expect(atualizar).toHaveBeenCalled());
  });
});
