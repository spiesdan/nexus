/**
 * TOKENS DE API — ERRO NÃO É VAZIO, E EXPIRADO NÃO É ATIVO.
 *
 * Medido na auditoria 5.10: a lista tratava falha de leitura como "Nenhum token
 * criado ainda." (o operador cria outro, ou acha que o token de produção sumiu)
 * e pintava "Ativo" num token com `expires_at` no passado — justamente o que o
 * MCP recusa. A revogação também era um clique sem confirmação, apesar de parar
 * toda automação que usa a credencial.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const estado = vi.hoisted(() => ({
  data: undefined as { data: unknown[] } | undefined,
  isLoading: false,
  isError: false,
}));
const refetch = vi.hoisted(() => vi.fn());
const revogar = vi.hoisted(() => vi.fn());
const confirmarMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/team/useApiTokens", () => ({
  useApiTokens: () => ({
    data: estado.data,
    isLoading: estado.isLoading,
    isError: estado.isError,
    refetch,
  }),
  useCreateApiToken: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeApiToken: () => ({ mutateAsync: revogar, isPending: false }),
}));
vi.mock("@/components/nexus-ui/forms/ConfirmacaoProvider", () => ({
  useConfirmar: () => confirmarMock,
}));

import { ApiTokensClient } from "@/app/app/settings/api-tokens/_components/ApiTokensClient";
import type { ApiTokenRow } from "@/hooks/team/useApiTokens";

function token(over: Partial<ApiTokenRow> = {}): ApiTokenRow {
  return {
    id: "tok-1",
    name: "Worker de import",
    prefix: "nx_abc",
    scopes: ["contacts:read"],
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function montar(linhas: ApiTokenRow[]) {
  estado.data = { data: linhas };
  estado.isLoading = false;
  estado.isError = false;
  return render(<ApiTokensClient />);
}

beforeEach(() => {
  refetch.mockReset();
  revogar.mockReset();
  revogar.mockResolvedValue({ data: {} });
  confirmarMock.mockReset();
  confirmarMock.mockResolvedValue(true);
});

afterEach(cleanup);

describe("tokens de API — estados", () => {
  it("falha de leitura mostra erro com retry, não 'nenhum token'", () => {
    estado.data = undefined;
    estado.isLoading = false;
    estado.isError = true;
    render(<ApiTokensClient />);

    expect(screen.queryByText("Nenhum token criado ainda.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("token com expires_at no passado aparece como Expirado, não Ativo", () => {
    montar([token({ expires_at: "2020-01-01T00:00:00.000Z" })]);

    expect(screen.getByText("Expirado")).toBeInTheDocument();
    expect(screen.queryByText("Ativo")).toBeNull();
  });

  it("token sem data diz que não expira em vez de traço mudo", () => {
    montar([token()]);
    expect(screen.getByText("Não expira")).toBeInTheDocument();
  });

  it("revogar pergunta antes; recusar não chama a rota", () => {
    confirmarMock.mockResolvedValue(false);
    montar([token()]);

    fireEvent.click(screen.getByRole("button", { name: "Revogar" }));

    expect(confirmarMock).toHaveBeenCalledTimes(1);
    expect(revogar).not.toHaveBeenCalled();
  });

  it("revogar confirmado chama a rota", async () => {
    montar([token()]);

    fireEvent.click(screen.getByRole("button", { name: "Revogar" }));

    await waitFor(() => expect(revogar).toHaveBeenCalledWith("tok-1"));
  });
});
