/**
 * MATRIZ E · 7 — RASCUNHO ENTRE ORGANIZAÇÕES E USUÁRIOS.
 *
 * Dois defeitos, um de privacidade e um de regressão:
 *
 *  1. **O rascunho era do navegador, não da pessoa.** `localStorage`
 *     `["pedido-rascunho"]` é uma gaveta única por origem: num balcão
 *     compartilhado — que é como loja pequena usa o sistema — a vendedora B
 *     abria o pedido e encontrava cliente, itens e preço da venda da vendedora
 *     A. Trocando de organização no mesmo browser, o vazamento era entre
 *     tenants. Agora a chave carrega organização + usuário (`chaveDoRascunho`),
 *     e a chave antiga NÃO é lida: restaurar rascunho de dono desconhecido é o
 *     vazamento.
 *
 *  2. **`descontoTexto` não voltava** ao restaurar — defeito herdado, fechado
 *     na auditoria do criador. Este arquivo mantém a regressão fechada junto
 *     com os demais campos editáveis que viajam no autosave.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderEditor } from "@/app/app/pedidos/novo/_editor";
import { chaveDoRascunho } from "@/app/app/pedidos/novo/_autosave";
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

const ANA = { orgId: "org-1", userId: "user-ana" };
const BRUNO = { orgId: "org-1", userId: "user-bruno" };
const OUTRA_ORG = { orgId: "org-2", userId: "user-ana" };

const BILL = {
  id: "c-bill",
  fantasia: "Bill Higiene",
  display_name: "BILL COMERCIO DE ESTOPAS LTDA",
  name: "BILL COMERCIO DE ESTOPAS LTDA",
  phone_number: "+5531999990000",
  email: null,
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

const LINHA = {
  key: "l1",
  product_id: "p1",
  codigo: "P1",
  nome: "Produto um",
  quantidade: 2,
  permite_fracao: false,
  precoTexto: "50,00",
  descontoPct: 0,
  estoque: null,
  origemPreco: "base" as const,
};

function gravarRascunho(dono: { orgId: string; userId: string }, dados: Record<string, unknown>) {
  window.localStorage.setItem(
    chaveDoRascunho(`${dono.orgId}:${dono.userId}`),
    JSON.stringify({
      salvoEm: Date.now(),
      dados: {
        chavePedido: "chave-fixa",
        contatoId: BILL.id,
        clienteNome: "Bill Higiene",
        linhas: [LINHA],
        condicao: "30/60",
        formaPagamento: "",
        exigeNf: false,
        observacoes: "Entregar de manhã",
        obsInterna: "",
        endereco: "Rua A, 10",
        transportadora: "",
        rastreamento: "",
        contatoNoCliente: "",
        tabelaId: "",
        descontoTexto: "15,00",
        descontoPctTexto: "3,5",
        freteTexto: "25,00",
        ...dados,
      },
    }),
  );
}

function montar(dono: { orgId: string; userId: string }) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OrderEditor
        produtos={[] as Produto[]}
        contatos={[BILL]}
        contatoInicial={null}
        tabelas={[]}
        verMargem={false}
        comissaoPct={null}
        descontoMaxVendedorPct={5}
        nomeOrganizacao="Org de teste"
        nomeVendedor="Vendedor"
        escopoDoRascunho={`${dono.orgId}:${dono.userId}`}
        textos={TEXTO}
      />
    </QueryClientProvider>,
  );
}

const campoCliente = () => (document.getElementById("busca-cliente") as HTMLInputElement).value;
const valor = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.mocked(apiClient.get).mockReset();
  window.localStorage.clear();
});

describe("rascunho é da pessoa na organização, não do navegador", () => {
  it("mesma pessoa na mesma organização retoma o rascunho", async () => {
    gravarRascunho(ANA, {});
    montar(ANA);
    await waitFor(() => expect(campoCliente()).toBe("Bill Higiene"));
  });

  it("OUTRO usuário no mesmo navegador não vê a venda de quem saiu", () => {
    gravarRascunho(ANA, {});
    montar(BRUNO);

    // Nada do rascunho da Ana aparece: nem cliente, nem itens, nem desconto.
    expect(campoCliente()).toBe("");
    expect(valor("desconto")).toBe("");
    expect(screen.queryByText("Produto um")).toBeNull();
  });

  it("OUTRA organização no mesmo navegador também não vê", () => {
    gravarRascunho(ANA, {});
    montar(OUTRA_ORG);

    expect(campoCliente()).toBe("");
    expect(screen.queryByText("Produto um")).toBeNull();
  });

  it("a chave legada sem escopo não é lida (é o vazamento que se está fechando)", () => {
    window.localStorage.setItem(
      "pedido-rascunho",
      JSON.stringify({
        salvoEm: Date.now(),
        dados: {
          contatoId: BILL.id,
          clienteNome: "Bill Higiene",
          linhas: [LINHA],
        },
      }),
    );

    montar(ANA);

    expect(campoCliente()).toBe("");
    expect(screen.queryByText("Produto um")).toBeNull();
  });

  it("as chaves de dois usuários convivem sem se sobrescrever", () => {
    gravarRascunho(ANA, { clienteNome: "Cliente da Ana" });
    gravarRascunho(BRUNO, { clienteNome: "Cliente do Bruno", contatoId: null });

    expect(chaveDoRascunho(`${ANA.orgId}:${ANA.userId}`)).not.toBe(
      chaveDoRascunho(`${BRUNO.orgId}:${BRUNO.userId}`),
    );
    expect(
      JSON.parse(window.localStorage.getItem(chaveDoRascunho(`${ANA.orgId}:${ANA.userId}`)) ?? "{}"),
    ).toMatchObject({ dados: { clienteNome: "Cliente da Ana" } });
    expect(
      JSON.parse(window.localStorage.getItem(chaveDoRascunho(`${BRUNO.orgId}:${BRUNO.userId}`)) ?? "{}"),
    ).toMatchObject({ dados: { clienteNome: "Cliente do Bruno" } });
  });
});

describe("desconto R$ volta ao restaurar (regressão do defeito herdado)", () => {
  it("descontoTexto, descontoPctTexto e frete voltam iguais, e o total os aplica", async () => {
    gravarRascunho(ANA, {});
    montar(ANA);

    await waitFor(() => expect(campoCliente()).toBe("Bill Higiene"));
    expect(valor("desconto")).toBe("15,00");
    // `type=number` só aceita ponto: vírgula no rascunho é normalizada.
    expect(valor("desconto-pct")).toBe("3.5");
    expect(valor("frete")).toBe("25,00");
    // 2 × 50,00 = 100,00; −15,00 −3,50 (3,5%) +25,00 = 106,50.
    expect(screen.getAllByText("R$ 106,50").length).toBeGreaterThanOrEqual(1);
  });

  it("rascunho sem os campos (versão anterior) não quebra a tela", async () => {
    gravarRascunho(ANA, {
      descontoTexto: undefined,
      descontoPctTexto: undefined,
      freteTexto: undefined,
    });
    montar(ANA);

    await waitFor(() => expect(campoCliente()).toBe("Bill Higiene"));
    expect(valor("desconto")).toBe("");
    expect(valor("desconto-pct")).toBe("");
    expect(valor("frete")).toBe("");
  });
});
