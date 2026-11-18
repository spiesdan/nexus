/**
 * J6 — ENCERRAR CONVERSA PELA TELA: o clique que nenhuma spec exercitava.
 *
 * `13-jornadas.md` §J6 mede 7 de 9 e nomeia a lacuna: "Encerrar ('Fechar esta
 * conversa?', com confirmação) e arquivar têm botão em ConversationHeader.tsx e
 * nenhum spec que clique neles".
 *
 * A prova de ROTA está em `inbox-fechar-e-arquivar-rotas.test.ts`. Aqui a
 * pergunta é diferente e não dá para respondê-la lá: o botão existe, ele abre a
 * CONFIRMAÇÃO, cancelar não fecha nada, confirmar chama a mutação com o id
 * certo — e uma conversa já encerrada não oferece "Fechar" de novo.
 *
 * Limite declarado: jsdom não tem layout. Este arquivo prova o FLUXO, não que
 * o botão caiba na barra em 1280px — isso é `inbox-header-nao-trava.test.tsx` e
 * a sonda de browser.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { ConfirmacaoProvider } from "@/components/nexus-ui/forms/ConfirmacaoProvider";

const mocks = vi.hoisted(() => ({
  closeMutate: vi.fn(),
  closePending: false,
}));

vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: mocks.closeMutate, isPending: mocks.closePending }),
}));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useReleaseConversation", () => ({
  useReleaseConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useResumeAiAttendance", () => ({
  useResumeAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/usePauseAiAttendance", () => ({
  usePauseAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useMarkNoSendConversation", () => ({
  useMarkNoSendConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, activeOrg: { orgId: "org-1", role: "manager" } }),
}));

const CONVERSA = "cv-fechar-1";

function conversa(status: string) {
  return {
    id: CONVERSA,
    organization_id: "org-1",
    contact_id: "ct-1",
    status,
    assigned_to_user_id: null,
    assignee_kind: "ai",
    snooze_until: null,
    bot_silenced_until: null,
    tags: [],
    contacts: { id: "ct-1", display_name: "Fulana", name: null, phone_number: "5511999" },
  } as unknown as React.ComponentProps<typeof ConversationHeader>["conversation"];
}

function renderHeader(status = "open") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConfirmacaoProvider>
        <ConversationHeader conversation={conversa(status)} />
      </ConfirmacaoProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.closeMutate.mockClear();
  mocks.closePending = false;
});

describe("ConversationHeader — encerrar pela tela", () => {
  it("o botão abre a confirmação; confirmar fecha a conversa certa", async () => {
    renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    // A pergunta é a copy do produto, não um window.confirm.
    expect(await screen.findByText("Fechar esta conversa?")).toBeTruthy();

    const botoes = screen.getAllByRole("button", { name: "Fechar" });
    // O último é o de confirmação dentro da dialog (o primeiro é o da barra).
    fireEvent.click(botoes.at(-1)!);

    await waitFor(() => expect(mocks.closeMutate).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    expect(mocks.closeMutate).toHaveBeenCalledWith({ conversation_id: CONVERSA });
  });

  it("cancelar NÃO fecha — clicar por engano não encerra o atendimento", async () => {
    renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(await screen.findByText("Fechar esta conversa?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(mocks.closeMutate).not.toHaveBeenCalled(), { timeout: 5_000 });
  });

  it("conversa já encerrada não oferece Fechar de novo", () => {
    renderHeader("closed");
    expect(screen.queryByRole("button", { name: "Fechar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Transferir" })).toBeNull();
  });
});
