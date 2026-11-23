/**
 * INFORMAÇÕES FISCAIS NO CRIADOR DE PEDIDOS.
 *
 * A ficha do pedido já tinha o campo (`0305`) que vira `infCpl` da NF-e, mas
 * o criador só oferecia "Informações adicionais" (`observacoes`). O vendedor
 * digitava a ordem de compra no campo errado e a nota saía com o texto
 * legado — ou sem texto nenhum. Aqui o campo novo aparece NO CRIADOR, entra
 * no payload, volta do rascunho e não apaga a observação.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));

vi.mock("@/lib/api/client", () => ({
  // `get` precisa devolver Promise: o debounce de busca de contatos dispara
  // depois do teste, e `undefined.then` virava erro não tratado na suíte cheia.
  apiClient: { get: mocks.get, post: mocks.post, patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/components/nexus-ui/forms/ConfirmacaoProvider", () => ({ useConfirmar: () => vi.fn() }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { OrderEditor } from "@/app/app/pedidos/novo/_editor";

type Textos = ComponentProps<typeof OrderEditor>["textos"];
const TEXTOS = new Proxy({} as Textos, { get: (_alvo, prop) => String(prop) });
const ESCOPO = "org-teste:user-teste";
const CHAVE = `pedido-rascunho:${ESCOPO}`;

function semearRascunho() {
  window.localStorage.setItem(
    CHAVE,
    JSON.stringify({
      salvoEm: Date.now(),
      dados: {
        contatoId: null,
        clienteNome: "Maria da Silva",
        linhas: [
          {
            key: "linha-1",
            product_id: "prod-1",
            codigo: "P1",
            nome: "Pão",
            quantidade: 1,
            permite_fracao: false,
            precoTexto: "10,00",
            descontoPct: 0,
            estoque: null,
          },
        ],
        observacoes: "observação antiga",
        informacoesFiscais: "OC-1234",
      },
    }),
  );
}

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrderEditor
      produtos={[]}
      contatos={[]}
      tabelas={[]}
      verMargem={false}
      comissaoPct={null}
      descontoMaxVendedorPct={5}
      nomeOrganizacao="Organização Teste"
      nomeVendedor="Vendedor"
      escopoDoRascunho={ESCOPO}
        textos={TEXTOS}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mocks.get.mockReset();
  mocks.get.mockResolvedValue({ data: [] });
  mocks.post.mockReset();
  mocks.post.mockResolvedValue({ numero: 42, aprovacao_necessaria: false });
  semearRascunho();
});

afterEach(() => cleanup());

describe("campo de Informações fiscais no criador", () => {
  it("restaura os dois textos do rascunho separadamente", async () => {
    renderEditor();
    await waitFor(() =>
      expect((screen.getByLabelText("informacoesFiscais") as HTMLInputElement).value).toBe("OC-1234"),
    );
    expect((screen.getByLabelText("observacoes") as HTMLInputElement).value).toBe(
      "observação antiga",
    );
  });

  it("envia os dois campos no payload sem sobrescrever a observação", async () => {
    renderEditor();
    await waitFor(() =>
      expect((screen.getByLabelText("informacoesFiscais") as HTMLInputElement).value).toBe("OC-1234"),
    );
    fireEvent.change(screen.getByLabelText("informacoesFiscais"), {
      target: { value: "OC-9999" },
    });
    const botoes = screen.getAllByRole("button", { name: "finalizar" });
    fireEvent.click(botoes[botoes.length - 1]!);

    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    const corpo = mocks.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(corpo.observacoes).toBe("observação antiga");
    expect(corpo.informacoes_fiscais).toBe("OC-9999");
  });
});
