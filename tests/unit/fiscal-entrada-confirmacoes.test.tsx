/**
 * AS AÇÕES DA NOTA DE ENTRADA QUE NÃO TÊM VOLTA PEDEM CONFIRMAÇÃO.
 *
 * A auditoria 5.8 (F3/F4) mediu: importar a entrada — que grava estoque e cria
 * contas a pagar — e manifestar desconhecimento/não realizada eram um clique só.
 * O teste cobra o contrato da tela: pergunta antes, e recusar não chama a API.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const confirmarMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/nexus-ui/forms/ConfirmacaoProvider", () => ({
  useConfirmar: () => confirmarMock,
}));

const postMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { post: postMock } }));

import { AcoesDaEntrada } from "@/app/app/fiscal/_components/AcoesDaEntrada";
import type { StatusDaConferencia, StatusDaEntrada } from "@/lib/schemas/fiscal-entrada";

function montar(over: {
  status?: StatusDaEntrada;
  conferencia?: StatusDaConferencia;
} = {}) {
  return render(
    <AcoesDaEntrada
      id="entrada-1"
      status={over.status ?? "nova"}
      conferencia={over.conferencia ?? "aprovada"}
      temXml
      podeGerir
      podeOperar
    />,
  );
}

beforeEach(() => {
  refresh.mockReset();
  postMock.mockReset();
  postMock.mockResolvedValue({ data: {} });
  confirmarMock.mockReset();
  confirmarMock.mockResolvedValue(true);
});

afterEach(cleanup);

describe("ações da nota de entrada — confirmação", () => {
  it("importar pergunta; recusar não move estoque nem cria contas a pagar", () => {
    confirmarMock.mockResolvedValue(false);
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Importar para estoque e financeiro" }));

    expect(confirmarMock).toHaveBeenCalledTimes(1);
    expect(postMock).not.toHaveBeenCalled();
  });

  it("importar confirmado chama a rota uma vez e atualiza a tela", async () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Importar para estoque e financeiro" }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/fiscal-entradas/entrada-1/importar", {}),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("ciência (210210) segue direto — é o passo normal, não uma declaração final", async () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Manifestar" }));

    expect(confirmarMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/fiscal-entradas/entrada-1/manifestar", {
        evento: "210210",
      }),
    );
  });

  it("desconhecimento (210220) pergunta antes de transmitir à SEFAZ", async () => {
    confirmarMock.mockResolvedValue(false);
    montar();

    fireEvent.change(screen.getByRole("combobox", { name: "Evento de manifestação" }), {
      target: { value: "210220" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Manifestar" }));

    expect(confirmarMock).toHaveBeenCalledTimes(1);
    expect(postMock).not.toHaveBeenCalled();
  });

  it("ignorar pergunta: a nota sai do fluxo de conferência", () => {
    confirmarMock.mockResolvedValue(false);
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Ignorar" }));

    expect(confirmarMock).toHaveBeenCalledTimes(1);
    expect(postMock).not.toHaveBeenCalled();
  });
});
