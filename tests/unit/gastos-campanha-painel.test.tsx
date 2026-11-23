/**
 * PAINEL DE GASTOS DA CAMPANHA — orçado × real com o mesmo guard, e a
 * distinção de permissão (viewer lê, manager lança/exclui).
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: mocks.get, post: mocks.post, delete: mocks.delete, patch: vi.fn() },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { GastosDaCampanha } from "@/app/app/prospeccao/campanhas/[id]/_gastos";

afterEach(() => cleanup());

const props = {
  campanhaId: "c-1",
  orcamentoProspeccaoCents: 20000,
  orcamentoMidiaCents: 5000,
  gastoProspeccaoCents: 9000,
};

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.delete.mockReset();
  mocks.get.mockResolvedValue({
    data: {
      lancamentos: [
        { id: "l1", data: "2026-11-20", valor_cents: 3000, observacao: "Meta", autor_id: "u1", created_at: "2026-11-20T00:00:00Z" },
      ],
    },
  });
});

describe("painel de gastos", () => {
  it("mostra orçado, gasto real e o aviso de lançamento manual", async () => {
    render(<GastosDaCampanha {...props} podeEditar={false} />);
    expect(screen.getByText("Gastos")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/R\$ 250,00/)).toBeTruthy());
    expect(screen.getByText(/LANÇAMENTO MANUAL/)).toBeTruthy();
    expect(screen.getByText(/Somente gerentes podem lançar/)).toBeTruthy();
    expect(screen.queryByText("Lançar mídia")).toBeNull();
  });

  it("manager vê o formulário e o histórico com exclusão", async () => {
    render(<GastosDaCampanha {...props} podeEditar={true} />);
    expect(screen.getByText("Lançar mídia")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Excluir")).toBeTruthy());
    expect(screen.getByText("Meta")).toBeTruthy();
  });

  it("estado sem orçamento é honesto (zero orçado, pct não inventado)", async () => {
    render(
      <GastosDaCampanha
        {...props}
        orcamentoProspeccaoCents={null}
        orcamentoMidiaCents={null}
        gastoProspeccaoCents={0}
        podeEditar={false}
      />,
    );
    await waitFor(() => expect(screen.getByText(/R\$ 0,00/)).toBeTruthy());
    // O mock de `get` devolve um lançamento; o ponto aqui é o orçamento nulo,
    // não o histórico vazio.
    expect(screen.getByText("Meta")).toBeTruthy();
  });
});
