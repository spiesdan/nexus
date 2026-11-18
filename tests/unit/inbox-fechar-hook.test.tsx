/**
 * J6 — o caminho de ERRO de encerrar conversa, do lado do cliente.
 *
 * Arquivo separado de `inbox-fechar-pela-tela.test.tsx` de propósito: aquele
 * mocka `useCloseConversation` para provar o clique; este precisa do hook REAL.
 * Os dois num arquivo só fazem o mock vencer o import e o teste do hook medir o
 * próprio dublê — foi exatamente o que aconteceu na primeira versão (verde em
 * tudo menos no `apiClient.post`, que nunca era chamado).
 *
 * O que se prova: a falha da API chega ao usuário (`showApiError`) e a lista é
 * invalidada. Sem as duas, a tela fica dizendo "aberta" depois de um fechamento
 * que não aconteceu — ou pior, finge que fechou.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCloseConversation } from "@/hooks/inbox/useCloseConversation";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

vi.mock("@/lib/api/client", () => ({ apiClient: { post: vi.fn() } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

const CONVERSA = "cv-hook-1";

function wrapperComCliente(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(showApiError).mockClear();
});

describe("useCloseConversation — o caminho de erro", () => {
  it("falha da API mostra o erro e invalida a lista — a tela não finge que fechou", async () => {
    const erro = new Error("403: papel insuficiente");
    vi.mocked(apiClient.post).mockRejectedValueOnce(erro);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidar = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCloseConversation(), {
      wrapper: wrapperComCliente(client),
    });
    result.current.mutate({ conversation_id: CONVERSA });

    await waitFor(() => expect(showApiError).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    expect(showApiError).toHaveBeenCalledWith(erro);
    expect(apiClient.post).toHaveBeenCalledWith(`/api/v1/conversations/${CONVERSA}/close`, {});
    // A conversa continua na tela com o status velho até a query ser refeita —
    // invalidar é o que faz o "aberta" virar o status real.
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["conversations"] });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["conversation", CONVERSA] });
  });

  it("sucesso NÃO chama showApiError e invalida as mesmas chaves", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { id: CONVERSA, status: "closed" },
    } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidar = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCloseConversation(), {
      wrapper: wrapperComCliente(client),
    });
    result.current.mutate({ conversation_id: CONVERSA });

    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ["conversations"] }), { timeout: 5_000 });
    expect(showApiError).not.toHaveBeenCalled();
  });
});
