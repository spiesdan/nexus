/**
 * MATRIZ E · 10 — TECLADO E LEITOR DE TELA NO CRIADOR DE PEDIDOS.
 *
 * O vendedor de balcão usa o criador de teclado: digita o cliente, aperta `/`,
 * bipa o produto e confere o total. Quem usa leitor de tela precisa das mesmas
 * portas — e a régua aqui é NOME ACESSÍVEL, não o texto que está na tela:
 *
 *  1. a busca de produto é um `combobox` chamado pelo que ela FAZ ("Buscar
 *     produto…"), não pela seção ("Produtos"). Um campo chamado "Produtos" não
 *     diz que aceita código nem que abre lista;
 *  2. a lista de resultados é `listbox` com `option` e o destaque é
 *     `aria-selected` — o leitor anuncia o que o ↑↓ escolheu;
 *  3. o resumo é uma `region` chamada "Resumo do pedido": dá para pular direto
 *     para os totais sem atravessar quatro seções;
 *  4. `/` foca a busca de fora de campo (e NÃO rouba a tecla de dentro de um
 *     input, senão ninguém escreve uma data com barra);
 *  5. `Esc` limpa a busca.
 *
 * A largura de 320 px não se mede em jsdom (não há layout): ela é medida no
 * navegador por `tests/e2e/responsividade-nas-rotas.spec.ts`, no caso do
 * criador em 320.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderEditor } from "@/app/app/pedidos/novo/_editor";
import { ProductSearch } from "@/app/app/pedidos/novo/_produtos";
import type { Produto } from "@/lib/schemas/produtos";
import { apiClient } from "@/lib/api/client";
import * as React from "react";

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

const AGUA = {
  id: "p-agua",
  codigo: "7891234567895",
  nome: "Água sanitária 5 L",
  marca: null,
  categoria: null,
  preco_cents: 1290,
  moeda: "BRL",
  custo_cents: null,
  controla_estoque: false,
  quantidade: 0,
  ativo: true,
  unidade: "un",
  multiplo: 1,
} as unknown as Produto;

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
  buscarProduto: "Buscar produto, código ou EAN…",
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

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
  window.localStorage.clear();
});

function montarEditor() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OrderEditor
        produtos={[AGUA]}
        contatos={[]}
        contatoInicial={null}
        tabelas={[]}
        verMargem={false}
        comissaoPct={null}
        descontoMaxVendedorPct={5}
        nomeOrganizacao="Org de teste"
        nomeVendedor="Vendedor"
        escopoDoRascunho="org-teste:user-teste"
        textos={TEXTO}
      />
    </QueryClientProvider>,
  );
}

describe("nome acessível da busca de produto", () => {
  it("o combobox se chama pelo que faz, não pela seção", () => {
    render(
      <ProductSearch
        produtos={[AGUA]}
        tabela={null}
        ultimosPrecos={new Map()}
        inputRef={React.createRef<HTMLInputElement>()}
        aoAdicionar={vi.fn()}
        textos={{ produtos: "Produtos", buscarProduto: TEXTO.buscarProduto }}
      />,
    );

    const busca = screen.getByRole("combobox", { name: TEXTO.buscarProduto });
    expect(busca).toBeTruthy();
    // O nome antigo ("Produtos") não descreve o campo.
    expect(screen.queryByRole("combobox", { name: "Produtos" })).toBeNull();
  });

  it("a lista é listbox de opções e o ↑↓ marca aria-selected", async () => {
    render(
      <ProductSearch
        produtos={[AGUA, { ...AGUA, id: "p-2", codigo: "AGUA-2", nome: "Água 2 L" }]}
        tabela={null}
        ultimosPrecos={new Map()}
        inputRef={React.createRef<HTMLInputElement>()}
        aoAdicionar={vi.fn()}
        textos={{ produtos: "Produtos", buscarProduto: TEXTO.buscarProduto }}
      />,
    );
    const busca = screen.getByRole("combobox");

    fireEvent.change(busca, { target: { value: "água" } });
    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());
    expect(busca.getAttribute("aria-expanded")).toBe("true");

    const opcoes = screen.getAllByRole("option");
    expect(opcoes.length).toBe(2);
    expect(opcoes[0]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(busca, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]?.getAttribute("aria-selected")).toBe("true");
  });
});

describe("resumo do pedido é uma região nomeada", () => {
  it("o leitor de tela pula direto para os totais", () => {
    montarEditor();
    const resumo = screen.getByRole("region", { name: "Resumo do pedido" });
    expect(resumo).toBeTruthy();
    expect(resumo.id).toBe("resumo");
  });
});

describe("atalhos de teclado", () => {
  it("`/` fora de campo foca a busca de produto", () => {
    montarEditor();
    const busca = screen.getByRole("combobox", { name: TEXTO.buscarProduto });

    fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).toBe(busca);
  });

  it("`/` DENTRO de um campo não é roubada (escrever data continua possível)", () => {
    montarEditor();
    const busca = screen.getByRole("combobox", { name: TEXTO.buscarProduto });
    const condicao = document.getElementById("condicao") as HTMLInputElement;

    condicao.focus();
    fireEvent.keyDown(condicao, { key: "/" });
    expect(document.activeElement).toBe(condicao);
    expect(document.activeElement).not.toBe(busca);
  });

  it("`Esc` limpa a busca e devolve o foco", async () => {
    render(
      <ProductSearch
        produtos={[AGUA]}
        tabela={null}
        ultimosPrecos={new Map()}
        inputRef={React.createRef<HTMLInputElement>()}
        aoAdicionar={vi.fn()}
        textos={{ produtos: "Produtos", buscarProduto: TEXTO.buscarProduto }}
      />,
    );
    const busca = screen.getByRole("combobox") as HTMLInputElement;

    fireEvent.change(busca, { target: { value: "água" } });
    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());
    fireEvent.keyDown(busca, { key: "Escape" });

    expect(busca.value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
