/**
 * FATURAMENTO TRUNCADO NÃO É FATURAMENTO COMPLETO.
 *
 * A rota tem teto de 2.000 pedidos e só registrava a truncagem no log (A10): a
 * tela somava a amostra e apresentava como o total do período. O teste cobra o
 * contrato da tela: quando a API manda `meta.amostra_parcial`, o aviso aparece
 * e diz que os KPIs são da amostra.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

const getMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { get: getMock } }));

import { FaturamentoClient } from "@/app/app/faturamento/_client";

const LINHA = {
  order_id: "pedido-1",
  numero: 10,
  data_emissao: "2026-11-10T12:00:00.000Z",
  cliente_nome: "Cliente",
  vendedor_user_id: null,
  total_cents: 1000,
  nf_serie: "1",
  nf_numero: 10,
  nf_status: "autorizada",
};

beforeEach(() => {
  getMock.mockReset();
});

afterEach(cleanup);

describe("Faturamento — janela truncada", () => {
  it("mostra o aviso de amostra parcial quando a API declara o teto", async () => {
    getMock.mockResolvedValue({
      data: [LINHA],
      meta: { amostra_parcial: true, teto: 2000 },
    });

    render(<FaturamentoClient nomesVendedores={{}} />);

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("mais de 2.000 pedidos"),
    );
  });

  it("não avisa nada quando a janela cabe no teto", async () => {
    getMock.mockResolvedValue({ data: [LINHA], meta: { amostra_parcial: false } });

    render(<FaturamentoClient nomesVendedores={{}} />);

    await waitFor(() => expect(screen.getByText("Faturado no período")).toBeInTheDocument());
    expect(screen.queryByRole("status")).toBeNull();
  });
});
