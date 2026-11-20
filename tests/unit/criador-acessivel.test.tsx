/**
 * MATRIZ E · 10 — TECLADO, LEITOR DE TELA E ALVO DE TOQUE NO CRIADOR.
 *
 * A régua é objetiva e não depende de opinião de design:
 *
 *  - **todo controle tem nome acessível** — campo sem rótulo é campo que o
 *    leitor de tela anuncia como "editar, em branco", e o vendedor cego não
 *    sabe se está digitando quantidade, preço ou desconto;
 *  - **o resumo é uma região nomeada** — quem navega por landmarks chega ao
 *    total sem atravessar 40 campos;
 *  - **a busca tem nome** e o atalho `/` leva o foco até ela;
 *  - **Ctrl/Cmd+Enter finaliza** e, com o pedido vazio, RECLAMA em vez de
 *    mandar um POST que o servidor recusaria;
 *  - **Esc** solta o foco (quem usa teclado não fica preso no campo).
 *
 * O overflow de 320 px não é mensurável em jsdom (não há layout); a prova
 * daquela largura vive em `tests/e2e/criador-pedido-acessivel-320.spec.ts`,
 * que mede `documentElement.scrollWidth` no navegador.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderEditor } from "@/app/app/pedidos/novo/_editor";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import type { Produto } from "@/lib/schemas/produtos";
import { apiClient } from "@/lib/api/client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const TEXTO = {
  titulo: "Novo pedido",
  subtitulo: "Busque o cliente e finalize.",
  cliente: "Cliente",
  buscarCliente: "Buscar cliente",
  clienteAvulso: "Cliente avulso",
  condicao: "Condição",
  formaPagamento: "Forma de pagamento",
  prazoLivre: "Prazo livre",
  prazoPrecisaNf: "Prazo com NF",
  exigeNf: "Nota fiscal",
  exigeNfOpcao: "Com NF",
  observacoes: "Observações",
  obsInterna: "Observação interna",
  endereco: "Endereço",
  enderecoExemplo: "Rua, número",
  transportadora: "Transportadora",
  tabelaPreco: "Tabela",
  semTabela: "Preço base",
  relacionados: "Relacionados",
  adicionar: "Adicionar",
  historico: "Histórico",
  rascunhoRestaurado: "Rascunho anterior restaurado",
  rascunhoDeOutroCliente: "Há um rascunho de outro cliente",
  rascunhoDeOutroClienteDesc: "Escolha qual manter.",
  usarClienteDoLink: "Usar o cliente do link",
  continuarRascunho: "Continuar o rascunho",
  produtos: "Produtos",
  buscarProduto: "Buscar produto",
  subtotal: "Subtotal",
  desconto: "Desconto",
  frete: "Frete",
  total: "Total",
  margem: "Margem",
  comissao: "Comissão",
  aguardandoAprovacao: "Aguardando aprovação",
  salvarRascunho: "Salvar rascunho",
  finalizar: "Gerar pedido",
  revisar: "Revisar",
  pedidoCriado: "Pedido criado",
};

const LINHA = {
  key: "l1",
  product_id: "p1",
  codigo: "P1",
  nome: "Produto um",
  quantidade: 2,
  permite_fracao: false,
  precoTexto: "50,00",
  descontoPct: 0,
  estoque: 5,
  unidade: "kg",
  multiplo: 1,
  origemPreco: "base" as const,
};

function montar({ comRascunho = true }: { comRascunho?: boolean } = {}) {
  if (comRascunho) {
    window.localStorage.setItem(
    "pedido-rascunho:org-teste:user-teste",
    JSON.stringify({
      salvoEm: Date.now(),
      dados: {
        chavePedido: "chave-fixa",
        contatoId: null,
        clienteNome: "Bill Higiene",
        linhas: [LINHA],
        condicao: "",
        observacoes: "",
        obsInterna: "",
        endereco: "",
        transportadora: "",
        rastreamento: "",
        contatoNoCliente: "",
        tabelaId: "",
        descontoTexto: "",
        descontoPctTexto: "",
        freteTexto: "",
      },
    }),
    );
  }
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OrderEditor
        produtos={[] as Produto[]}
        contatos={[
          {
            id: "c-bill",
            fantasia: "Bill Higiene",
            display_name: "BILL",
            name: "BILL",
            phone_number: null,
            email: null,
          },
        ]}
        contatoInicial={null}
        tabelas={[{ id: "tab-1", nome: "Tabela Ouro", desconto_pct: 10 }]}
        verMargem
        comissaoPct={2}
        descontoMaxVendedorPct={5}
        nomeOrganizacao="Org de teste"
        nomeVendedor="Vendedor"
        escopoDoRascunho="org-teste:user-teste"
        textos={TEXTO}
      />
    </QueryClientProvider>,
  );
}

/** Nome acessível pela mesma cadeia que o leitor de tela usa (aria > label). */
function nomeAcessivel(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const alvo = document.getElementById(labelledby);
    if (alvo?.textContent?.trim()) return alvo.textContent.trim();
  }
  const id = el.getAttribute("id");
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }
  const dentro = el.closest("label");
  if (dentro?.textContent?.trim()) return dentro.textContent.trim();
  if (el.tagName === "BUTTON" || el.tagName === "A") return el.textContent?.trim() ?? "";
  return "";
}

let container: HTMLElement;

beforeEach(() => {
  window.localStorage.clear();
  // jsdom não implementa `scrollIntoView`; o editor rola até a seção que
  // reclamou (comportamento real) e sem o stub isso vira unhandled rejection.
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url.startsWith("/api/v1/price-tables/")) return Promise.resolve({ data: { itens: [] } }) as never;
    return Promise.resolve({ data: [] }) as never;
  });
  container = montar().container;
});

afterEach(() => {
  cleanup();
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(nexusToast.error).mockReset();
  window.localStorage.clear();
});

describe("nome acessível de todo controle", () => {
  it("nenhum campo, botão ou select fica sem nome", () => {
    const controles = [
      ...container.querySelectorAll("input, select, textarea, button, a[href]"),
    ].filter((el) => (el as HTMLInputElement).type !== "hidden");

    const semNome = controles
      .filter((el) => nomeAcessivel(el).length === 0)
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`);

    expect(semNome).toEqual([]);
  });

  it("a busca de produto e o resumo têm nome; o resumo é uma região", () => {
    // Combobox chamado pelo que FAZ ("Buscar produto"), não pela seção
    // ("Produtos"): quem chega pelo leitor precisa saber que ali se busca.
    expect(screen.getByRole("combobox", { name: "Buscar produto" })).toBeTruthy();
    // `role=region` + aria-label = landmark navegável: o leitor de tela pula
    // direto ao total em vez de atravessar o formulário inteiro.
    const resumo = screen.getByRole("region", { name: "Resumo do pedido" });
    expect(resumo.id).toBe("resumo");
  });

  it("o botão de remover item diz o que remove (não é um 'x' mudo)", () => {
    expect(screen.getByRole("button", { name: "Remover item" })).toBeTruthy();
  });

  it("o stepper tem rótulos nos dois botões e no campo", () => {
    expect(screen.getByRole("button", { name: "Diminuir quantidade" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aumentar quantidade" })).toBeTruthy();
    expect(screen.getByLabelText("Quantidade (kg)")).toBeTruthy();
  });
});

describe("teclado", () => {
  it("`/` leva o foco para a busca de produto", () => {
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement?.id).toBe("busca-produto");
  });

  it("Esc solta o foco do campo", () => {
    const busca = document.getElementById("busca-produto") as HTMLInputElement;
    busca.focus();
    expect(document.activeElement?.id).toBe("busca-produto");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement?.id).not.toBe("busca-produto");
  });

  it("Ctrl+Enter com o pedido sem cliente reclama e não manda POST", () => {
    cleanup();
    window.localStorage.clear();
    const vazio = montar({ comRascunho: false }).container;
    expect(vazio).toBeTruthy();

    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });

    expect(vi.mocked(apiClient.post)).not.toHaveBeenCalled();
    expect(vi.mocked(nexusToast.error)).toHaveBeenCalledWith(
      "Escolha ou digite o nome do cliente.",
    );
  });
});
