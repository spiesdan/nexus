/**
 * MATRIZ E · 3, 4, 5, 6 — TABELA/OVERRIDE, ESTOQUE, CRÉDITO E PARCELAS.
 *
 * Cada bloco prende um comportamento que a auditoria funcional do criador de
 * pedidos listou, com o número fechado:
 *
 *  3. trocar a tabela de preço REFLETE nos itens (o defeito: só o `tabelaId`
 *     mudava, os itens ficavam com o preço antigo e o servidor recusava o
 *     pedido inteiro no fim); preço digitado à mão marca `manual` e NÃO é
 *     sobrescrito por cálculo — é decisão comercial, não resto de conta;
 *  4. os quatro estados de estoque de B.10 continuam corretos e a tela declara
 *     que não há reserva;
 *  5. crédito: a tela avisa ANTES de gerar quando `em aberto + este pedido`
 *     passa do limite, com a MESMA régua do gate do servidor;
 *  6. quantidade inteira (B.14) e parcelas que somam o total; fração/granel
 *     segue como decisão pendente — o que se garante é que não quebra.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderEditor } from "@/app/app/pedidos/novo/_editor";
import { OrderItems, type LinhaDoPedido } from "@/app/app/pedidos/novo/_itens";
import { calcularParcelas } from "@/lib/schemas/pedidos";
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

const BILL = {
  id: "c-bill",
  fantasia: "Bill Higiene",
  display_name: "BILL COMERCIO DE ESTOPAS LTDA",
  name: "BILL COMERCIO DE ESTOPAS LTDA",
  phone_number: "+5531999990000",
  email: "bill@teste.local",
};

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

function produto(over: Partial<Produto>): Produto {
  return {
    id: "p1",
    codigo: "P1",
    nome: "Produto um",
    marca: null,
    categoria: null,
    preco_cents: 5000,
    moeda: "BRL",
    custo_cents: 3000,
    controla_estoque: true,
    quantidade: 10,
    ativo: true,
    unidade: "un",
    multiplo: 1,
    ...over,
  } as unknown as Produto;
}

function linha(over: Partial<LinhaDoPedido> = {}): LinhaDoPedido {
  return {
    key: "l1",
    product_id: "p1",
    codigo: "P1",
    nome: "Produto um",
    quantidade: 1,
    permite_fracao: false,
    precoTexto: "50,00",
    descontoPct: 0,
    estoque: 10,
    unidade: "un",
    multiplo: 1,
    origemPreco: "base",
    ...over,
  };
}

function rascunho(dados: Record<string, unknown>) {
  window.localStorage.setItem(
    "pedido-rascunho:org-teste:user-teste",
    JSON.stringify({
      salvoEm: Date.now(),
      dados: {
        chavePedido: "chave-fixa",
        contatoId: null,
        clienteNome: "Bill Higiene",
        linhas: [linha()],
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
        ...dados,
      },
    }),
  );
}

function montar(
  props: {
    produtos?: Produto[];
    tabelas?: { id: string; nome: string; desconto_pct: number }[];
    contatoInicial?: string | null;
  } = {},
) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrderEditor
        produtos={props.produtos ?? [produto({})]}
        contatos={[BILL]}
        contatoInicial={props.contatoInicial ?? null}
        tabelas={props.tabelas ?? []}
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

const precoDaLine = () => (screen.getAllByLabelText("Preço")[0] as HTMLInputElement).value;
const origemDaLine = () =>
  document.querySelector('[data-testid^="origem-preco-"]')?.textContent ?? "";

describe("E.1/E.2 — produto que só a busca do servidor encontrou entra no pedido", () => {
  it("o clique no resultado remoto adiciona o item (sem o filtro porId)", async () => {
    const remoto = produto({
      id: "remoto",
      codigo: "REMOTO-1",
      nome: "Produto Remoto",
      unidade: null,
      controla_estoque: false,
    });
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/api/v1/products?busca=")) {
        return Promise.resolve({ data: [remoto] }) as never;
      }
      if (url.startsWith("/api/v1/price-tables/")) return Promise.resolve({ data: { itens: [] } }) as never;
      if (url.startsWith("/api/v1/contacts/")) {
        return Promise.resolve({
          data: { limite_credito_cents: null, condicao_pagamento: null },
        }) as never;
      }
      return Promise.resolve({ data: [] }) as never;
    });

    montar({ produtos: [] });
    fireEvent.change(document.getElementById("busca-produto")!, {
      target: { value: "REMOTO-1" },
    });
    await waitFor(() => expect(screen.getByText("Produto Remoto")).toBeTruthy());
    fireEvent.click(screen.getByRole("option", { name: /REMOTO-1/ }));

    await waitFor(() =>
      expect(screen.queryByText("Nenhum item ainda — busque e adicione.")).toBeNull(),
    );
    expect(screen.getByText("Produto Remoto")).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: /Quantidade/ })).toBeTruthy();
  });
});

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url.startsWith("/api/v1/price-tables/")) return Promise.resolve({ data: { itens: [] } }) as never;
    if (url.startsWith("/api/v1/contacts/")) {
      return Promise.resolve({
        data: { limite_credito_cents: null, condicao_pagamento: null },
      }) as never;
    }
    return Promise.resolve({ data: [] }) as never;
  });
});

afterEach(() => {
  cleanup();
  vi.mocked(apiClient.get).mockReset();
  window.localStorage.clear();
});

describe("3 · tabela de preço reflete nos itens", () => {
  it("com tabela aplicada, o preço do item é o da tabela (override vence o desconto)", async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/price-tables/")) {
        return Promise.resolve({ data: { itens: [{ product_id: "p1", preco_cents: 4200 }] } }) as never;
      }
      return Promise.resolve({ data: [] }) as never;
    });
    rascunho({ tabelaId: "tab-1" });

    montar({ tabelas: [{ id: "tab-1", nome: "Tabela Ouro", desconto_pct: 10 }] });

    // 42,00 (override) — não 45,00 (10% sobre 50,00) nem 50,00 (base).
    await waitFor(() => expect(precoDaLine()).toBe("42,00"));
    expect(origemDaLine()).toBe("preço da tabela");
  });

  it("sem override, o desconto da tabela é aplicado ao preço base", async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/price-tables/")) return Promise.resolve({ data: { itens: [] } }) as never;
      return Promise.resolve({ data: [] }) as never;
    });
    rascunho({ tabelaId: "tab-1" });

    montar({ tabelas: [{ id: "tab-1", nome: "Tabela Ouro", desconto_pct: 10 }] });

    await waitFor(() => expect(precoDaLine()).toBe("45,00"));
    expect(origemDaLine()).toBe("preço da tabela");
  });

  it("adicionar com a tabela JÁ carregada entra com o preço dela, não o de catálogo", async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/price-tables/")) return Promise.resolve({ data: { itens: [] } }) as never;
      return Promise.resolve({ data: [] }) as never;
    });
    rascunho({ tabelaId: "tab-1" });
    montar({
      produtos: [
        produto({}),
        produto({
          id: "p2",
          codigo: "P2",
          nome: "Produto dois",
          preco_cents: 10000,
          quantidade: 5,
        }),
      ],
      tabelas: [{ id: "tab-1", nome: "Tabela Ouro", desconto_pct: 10 }],
    });

    // A tabela carregou de fato: a linha restaurada já está a 45,00.
    await waitFor(() => expect(precoDaLine()).toBe("45,00"));

    fireEvent.change(screen.getByRole("combobox", { name: "Buscar produto" }), {
      target: { value: "P2" },
    });
    fireEvent.click(screen.getByRole("option", { name: /Produto dois/ }));

    // 90,00 é o preço da tabela (10% sobre 100,00). Antes da correção o item
    // entrava a 100,00 — e ainda assim rotulado "preço da tabela".
    await waitFor(() =>
      expect(
        screen.getAllByLabelText("Preço").map((i) => (i as HTMLInputElement).value),
      ).toEqual(["45,00", "90,00"]),
    );
    expect(
      [...document.querySelectorAll('[data-testid^="origem-preco-"]')].map((e) => e.textContent),
    ).toEqual(["preço da tabela", "preço da tabela"]);
  });

  it("sem tabela, o preço volta ao de catálogo e a origem diz base", async () => {
    rascunho({ tabelaId: "", linhas: [linha({ precoTexto: "45,00", origemPreco: "tabela" })] });

    montar();

    await waitFor(() => expect(precoDaLine()).toBe("50,00"));
    expect(origemDaLine()).toBe("preço base");
  });

  it("preço digitado à mão marca manual e NÃO é sobrescrito pela tabela", async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/price-tables/")) {
        return Promise.resolve({ data: { itens: [{ product_id: "p1", preco_cents: 4200 }] } }) as never;
      }
      return Promise.resolve({ data: [] }) as never;
    });
    rascunho({
      tabelaId: "tab-1",
      linhas: [linha({ precoTexto: "39,90", origemPreco: "manual" })],
    });

    montar({ tabelas: [{ id: "tab-1", nome: "Tabela Ouro", desconto_pct: 10 }] });

    // Sem troca de tabela, o valor negociado continua de pé.
    await waitFor(() => expect(origemDaLine()).toBe("preço manual"));
    expect(precoDaLine()).toBe("39,90");
  });

  it("editar o preço na linha marca a origem como manual", () => {
    const aoMudar = vi.fn();
    render(
      <OrderItems
        linhas={[linha({ origemPreco: "tabela" })]}
        aoMudar={aoMudar}
        aoRemover={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Preço"), { target: { value: "39,90" } });
    expect(aoMudar).toHaveBeenCalledWith("l1", { precoTexto: "39,90", origemPreco: "manual" });
  });
});

describe("4 · estoque: quatro estados e nenhuma reserva", () => {
  it("distingue saldo, sem saldo, insuficiente e não controlado", () => {
    render(
      <OrderItems
        linhas={[
          linha({ key: "a", estoque: null }),
          linha({ key: "b", estoque: 0, quantidade: 1 }),
          linha({ key: "c", estoque: 1, quantidade: 3 }),
          linha({ key: "d", estoque: 5, quantidade: 2 }),
        ]}
        aoMudar={vi.fn()}
        aoRemover={vi.fn()}
      />,
    );

    expect(screen.getByText("estoque não controlado")).toBeTruthy();
    expect(screen.getByText("sem saldo")).toBeTruthy();
    expect(screen.getByText("insuficiente: 1 disponível")).toBeTruthy();
    expect(screen.getByText("5 em estoque")).toBeTruthy();
  });

  it("o editor declara que o saldo só é conferido ao gerar — não há reserva", () => {
    rascunho({ linhas: [linha()] });
    montar();

    expect(
      screen.getByText("O saldo é conferido ao gerar o pedido; não há reserva de estoque."),
    ).toBeTruthy();
  });
});

describe("5 · crédito: avisa antes de gerar, com a régua do servidor", () => {
  it("em aberto + este pedido acima do limite mostra o aviso ANTES do POST", async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/contacts/")) {
        return Promise.resolve({
          data: { limite_credito_cents: 10000, condicao_pagamento: null },
        }) as never;
      }
      if (url.startsWith("/api/v1/commercial-orders")) {
        return Promise.resolve({
          data: [{ total_cents: 9000, status: "aprovado", created_at: "2026-11-01T00:00:00Z" }],
        }) as never;
      }
      return Promise.resolve({ data: [] }) as never;
    });
    rascunho({ contatoId: BILL.id, linhas: [linha({ quantidade: 1, precoTexto: "50,00" })] });

    montar({ contatoInicial: BILL.id });

    // 90,00 em aberto + 50,00 deste pedido > 100,00 de limite.
    await waitFor(() => expect(screen.getByTestId("credito-estourado")).toBeTruthy());
    expect(screen.getByTestId("credito-estourado").textContent).toContain("R$ 90,00");
    expect(screen.getByTestId("credito-estourado").textContent).toContain(
      "só um gerente pode liberar",
    );
    // Nada foi enviado: o aviso é ANTES do clique.
    expect(vi.mocked(apiClient.post)).not.toHaveBeenCalled();
  });

  it("rascunho/orçamento não conta como dívida (a mesma lista do gate)", async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/contacts/")) {
        return Promise.resolve({
          data: { limite_credito_cents: 10000, condicao_pagamento: null },
        }) as never;
      }
      if (url.startsWith("/api/v1/commercial-orders")) {
        return Promise.resolve({
          data: [{ total_cents: 9000, status: "rascunho", created_at: "2026-11-01T00:00:00Z" }],
        }) as never;
      }
      return Promise.resolve({ data: [] }) as never;
    });
    rascunho({ contatoId: BILL.id, linhas: [linha({ precoTexto: "50,00" })] });

    montar({ contatoInicial: BILL.id });
    await waitFor(() => expect(screen.getByText("Bill Higiene")).toBeTruthy());
    // 9.000 de orçamento não é compromisso: nada a avisar.
    expect(screen.queryByTestId("credito-estourado")).toBeNull();
  });

  it("cliente com folga não recebe aviso", async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/contacts/")) {
        return Promise.resolve({
          data: { limite_credito_cents: 100000, condicao_pagamento: null },
        }) as never;
      }
      return Promise.resolve({ data: [] }) as never;
    });
    rascunho({ contatoId: BILL.id, linhas: [linha({ precoTexto: "50,00" })] });

    montar({ contatoInicial: BILL.id });
    await waitFor(() => expect(screen.getByText("Bill Higiene")).toBeTruthy());
    expect(screen.queryByTestId("credito-estourado")).toBeNull();
  });
});

describe("6 · parcelas e fração", () => {
  it("as parcelas somam exatamente o total, inclusive o resto do arredondamento", () => {
    const parcelas = calcularParcelas(10000, "30/60/90");
    expect(parcelas.map((p) => p.valor_cents)).toEqual([3333, 3333, 3334]);
    expect(parcelas.reduce((s, p) => s + p.valor_cents, 0)).toBe(10000);
  });

  it("à vista (um prazo) não gera parcela — não há o que dividir", () => {
    expect(calcularParcelas(10000, "30 dias")).toEqual([]);
    expect(calcularParcelas(10000, "")).toEqual([]);
  });

  it("o resumo mostra as parcelas que somam o total", async () => {
    rascunho({
      condicao: "30/60/90",
      linhas: [linha({ quantidade: 2, precoTexto: "50,00" })],
    });
    montar();

    await waitFor(() => expect(screen.getByText(/1ª ·/)).toBeTruthy());
    expect(screen.getAllByText("R$ 33,33")).toHaveLength(2);
    expect(screen.getByText("R$ 33,34")).toBeTruthy();
    // Total do pedido: 2 × 50,00 = 100,00.
    expect(screen.getAllByText("R$ 100,00").length).toBeGreaterThanOrEqual(1);
  });

  it("quantidade fracionária não entra: a tela trunca para inteiro", () => {
    const aoMudar = vi.fn();
    render(
      <OrderItems
        linhas={[linha({ unidade: "kg", multiplo: 3 })]}
        aoMudar={aoMudar}
        aoRemover={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Quantidade (kg)"), { target: { value: "1.5" } });
    expect(aoMudar).toHaveBeenCalledWith("l1", { quantidade: 1 });
    // Granel/múltiplo é decisão pendente: a linha informa e não quebra.
    expect(screen.getByText("vendido em múltiplos de 3")).toBeTruthy();
  });
});
