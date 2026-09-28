/**
 * TenantReasonDialog — a fusão de Suspender × Reativar (Fase 3d).
 *
 * Os dois diálogos antigos eram 123 linhas idênticas com cópias e endpoints
 * diferentes. O que a fusão precisa provar é que nada disso se misturou:
 *
 *  1. a régua dos 10 caracteres continua travando o confirmar (regra dos dois
 *     antigos, agora herdada do `confirmDisabled` do NexusConfirmDialog);
 *  2. cada ação fala a SUA copy e bate no SEU endpoint — suspender não pode
 *     mandar para `/reactivate` nem dizer "Reativar tenant";
 *  3. a mutação que falha mantém a dialog ABERTA com o motivo ainda no campo
 *     (o toast é do hook; a decisão de não fechar é do contrato do
 *     NexusConfirmDialog);
 *  4. fechar limpa o motivo — quem reabre não lê o texto do operador anterior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const postMock = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: (...a: unknown[]) => postMock(...a),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => toastSuccess(m),
    error: (m: string) => toastError(m),
  },
}));

import { TenantReasonDialog } from "@/components/admin/tenants/TenantReasonDialog";

const MOTIVO = "Revisão de segurança pendente";
const onClose = vi.fn();

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function dialog(acao: "suspender" | "reativar") {
  return (
    <TenantReasonDialog
      acao={acao}
      open
      onClose={onClose}
      organizationId="org-1"
    />
  );
}

function dialogAlvo() {
  return screen.getByRole("alertdialog");
}

async function digitar(texto: string) {
  const campo = await screen.findByLabelText(/Motivo/);
  fireEvent.change(campo, { target: { value: texto } });
}

beforeEach(() => {
  postMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  onClose.mockReset();
  postMock.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

describe("a régua dos 10 caracteres", () => {
  it("motivo curto mantém o confirmar desabilitado, e 10+ habilita", async () => {
    render(wrap(dialog("suspender")));

    const confirmar = within(dialogAlvo()).getByRole("button", {
      name: "Confirmar suspensão",
    });
    expect(confirmar).toBeDisabled();

    await digitar("curto");
    expect(confirmar).toBeDisabled();

    await digitar(MOTIVO);
    expect(confirmar).toBeEnabled();
  });
});

describe("cada ação fala a sua copy e bate no seu endpoint", () => {
  it("suspender: título próprio, botão destrutivo, POST /suspend", async () => {
    render(wrap(dialog("suspender")));

    expect(screen.getByText("Suspender tenant")).toBeInTheDocument();
    await digitar(MOTIVO);
    fireEvent.click(
      within(dialogAlvo()).getByRole("button", { name: "Confirmar suspensão" }),
    );

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/admin/tenants/org-1/suspend", {
        reason: MOTIVO,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledWith());
    expect(toastSuccess).toHaveBeenCalledWith("Tenant suspenso com sucesso");
  });

  it("reativar: título e endpoint próprios — não herda nada do suspender", async () => {
    render(wrap(dialog("reativar")));

    expect(screen.getByText("Reativar tenant")).toBeInTheDocument();
    expect(screen.queryByText("Suspender tenant")).not.toBeInTheDocument();

    await digitar(MOTIVO);
    fireEvent.click(
      within(dialogAlvo()).getByRole("button", { name: "Confirmar reativação" }),
    );

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/admin/tenants/org-1/reactivate", {
        reason: MOTIVO,
      }),
    );
    expect(postMock).not.toHaveBeenCalledWith(
      "/api/v1/admin/tenants/org-1/suspend",
      expect.anything(),
    );
  });
});

describe("mutação que falha", () => {
  it("mantém a dialog aberta com o motivo no campo (o toast é do hook)", async () => {
    postMock.mockRejectedValue(new Error("503"));
    render(wrap(dialog("suspender")));

    await digitar(MOTIVO);
    fireEvent.click(
      within(dialogAlvo()).getByRole("button", { name: "Confirmar suspensão" }),
    );

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByText("Suspender tenant")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Motivo/)).toHaveValue(MOTIVO);
  });
});

describe("fechar limpa o motivo", () => {
  it("cancelar devolve o controle ao chamador e o reabrir não mostra o texto velho", async () => {
    const { rerender } = render(wrap(dialog("suspender")));

    await digitar(MOTIVO);
    fireEvent.click(within(dialogAlvo()).getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledWith();

    // O chamador (TenantActions) responde ao onClose fechando a prop.
    rerender(wrap(<TenantReasonDialog acao="suspender" open={false} onClose={onClose} organizationId="org-1" />));
    rerender(wrap(dialog("suspender")));

    expect(screen.getByLabelText(/Motivo/)).toHaveValue("");
  });
});
