/**
 * REENVIAR UMA MENSAGEM QUE FALHOU — o buraco medido na auditoria 5.4.
 *
 * A bolha mostrava "Falhou" e o motivo, sem saída. O teste prova duas coisas
 * que o `podeReenviar` sozinho não prova: (1) o botão só nasce onde há o que
 * reenviar, e (2) o clique chama o MESMO POST do composer com o conteúdo da
 * linha — inclusive a citação —, não um caminho paralelo.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postMock = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: { post: (...args: unknown[]) => postMock(...args) },
}));

const showApiErrorMock = vi.fn();
vi.mock("@/components/feedback/ApiErrorToast", () => ({
  showApiError: (...args: unknown[]) => showApiErrorMock(...args),
}));

const toastSuccessMock = vi.fn();
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: (...args: unknown[]) => toastSuccessMock(...args), error: vi.fn() },
}));

import { MessageBubble } from "@/components/inbox/MessageBubble";
import type { Message } from "@/lib/types/messaging";

function mensagem(over: Partial<Message> = {}): Message {
  return {
    id: "m-1",
    organization_id: "org-1",
    conversation_id: "conv-1",
    channel_session_id: "sess-1",
    contact_id: "contato-1",
    external_id: null,
    type: "text",
    direction: "outbound",
    status: "failed",
    ack: null,
    error_code: "send_failed",
    error_message: "Número desconectado",
    body: "Bom dia!",
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: "user",
    sent_by_user_id: null,
    sent_at: "2026-11-18T12:00:00.000Z",
    delivered_at: null,
    read_at: null,
    metadata: {},
    edited_at: null,
    revoked_at: null,
    reply_to_message_id: null,
    created_at: "2026-11-18T12:00:00.000Z",
    ...over,
  };
}

function renderizar(m: Message) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MessageBubble message={m} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  postMock.mockReset();
  showApiErrorMock.mockReset();
  toastSuccessMock.mockReset();
});

afterEach(cleanup);

describe("Bolha de mensagem — reenvio", () => {
  it("mostra 'Reenviar' na mensagem que falhou e repete pelo POST canônico", async () => {
    postMock.mockResolvedValue({ data: mensagem({ id: "m-2", status: "sent" }) });

    renderizar(mensagem({ reply_to_message_id: "m-0" }));
    fireEvent.click(screen.getByRole("button", { name: "Reenviar mensagem" }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/messages", {
        conversation_id: "conv-1",
        type: "text",
        body: "Bom dia!",
        reply_to_message_id: "m-0",
      }),
    );
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });

  it("não oferece reenvio para mensagem entregue", () => {
    renderizar(mensagem({ status: "delivered", ack: 2 }));
    expect(screen.queryByRole("button", { name: "Reenviar mensagem" })).toBeNull();
  });

  it("não oferece reenvio para template — os valores do modelo não estão na linha", () => {
    renderizar(mensagem({ type: "template", body: null }));
    expect(screen.queryByRole("button", { name: "Reenviar mensagem" })).toBeNull();
  });

  it("não oferece reenvio para mensagem apagada para todos", () => {
    renderizar(mensagem({ revoked_at: "2026-11-18T12:01:00.000Z" }));
    expect(screen.queryByRole("button", { name: "Reenviar mensagem" })).toBeNull();
  });

  it("trava o botão durante o envio (um clique, um POST)", async () => {
    let resolver: (v: unknown) => void = () => {};
    postMock.mockReturnValue(new Promise((r) => (resolver = r)));

    renderizar(mensagem());
    const botao = screen.getByRole("button", { name: "Reenviar mensagem" });
    fireEvent.click(botao);
    fireEvent.click(botao);

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Reenviar mensagem" })).toBeDisabled();

    resolver({ data: mensagem({ id: "m-2", status: "sent" }) });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reenviar mensagem" })).not.toBeDisabled(),
    );
  });

  it("falha no reenvio mostra o erro e mantém o botão para tentar de novo", async () => {
    postMock.mockRejectedValue(new Error("canal fora"));

    renderizar(mensagem());
    fireEvent.click(screen.getByRole("button", { name: "Reenviar mensagem" }));

    await waitFor(() => expect(showApiErrorMock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Reenviar mensagem" })).not.toBeDisabled();
  });
});
