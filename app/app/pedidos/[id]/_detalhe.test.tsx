/**
 * A FICHA DO PEDIDO MOSTRA OS ITENS QUE O BANCO TEM — NÃO OS DA ABERTURA.
 *
 * Medido em 12/11/2026, no pedido 19538: o Mercos reescreveu os itens
 * (0297), o aviso "Este pedido mudou no Mercos" apareceu no topo, o total
 * atualizou — e a tabela de produtos continuou exibindo a lista velha. Os
 * itens eram só prop do Server Component; o `recarregar()` trazia o pedido
 * novo e descartava `corpo.data.itens`.
 *
 * É o pior tipo de mentira que essa tela podia contar: quem confere o pedido
 * antes de emitir a NF-e aprovaria uma lista de produtos que não é a que vai
 * para a SEFAZ. A nota fiscal sai de `commercial_order_items`; a ficha tem
 * que mostrar exatamente isso.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
const confirmarMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/nexus-ui/forms/ConfirmacaoProvider", () => ({
  useConfirmar: () => confirmarMock,
}));
vi.mock("@/components/nexus-ui/layout/NexusPageHeader", () => ({
  // As ações da ficha moram no slot do cabeçalho: um mock que devolve null
  // esconde justamente os botões que estes testes clicam.
  NexusPageHeader: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div>,
}));
vi.mock("../../products/_fotos", () => ({ FotosDoProduto: () => null }));
// O editor de itens é outro componente (e outro teste): aqui só interessa que
// o "salvar" dele dispara o `recarregar()` da ficha.
vi.mock("./_editar-itens", () => ({
  EditorDeItens: ({ aoSalvar }: { aoSalvar: () => Promise<void> }) => (
    <button type="button" onClick={() => void aoSalvar()}>
      salvar-itens
    </button>
  ),
}));

import { apiClient } from "@/lib/api/client";
import type { ItemDoPedido, PedidoComercial } from "@/lib/schemas/pedidos";
import { DetalheDoPedido } from "./_detalhe";

const PEDIDO_ID = "f323e73d-29d9-476a-b144-6198e05f1004";

function pedidoDeTeste(status: PedidoComercial["status"]): PedidoComercial {
  return {
    id: PEDIDO_ID,
    numero: 19538,
    contact_id: "contato-1",
    cliente_nome: "VITINS ODONTOLOGIA LTDA",
    cliente_documento: "04553316000161",
    created_by: null,
    vendedor_user_id: null,
    status,
    origem: "mercos",
    moeda: "BRL",
    subtotal_cents: 42600,
    desconto_cents: 0,
    desconto_pct: null,
    frete_cents: 0,
    total_cents: 42600,
    condicao_pagamento: "28 dias",
    exige_nf: true,
    forma_pagamento: null,
    price_table_id: null,
    informacoes_fiscais: null,
    observacoes: null,
    obs_interna: null,
    endereco_entrega: null,
    transportadora_nome: null,
    rastreamento: null,
    contato_no_cliente: null,
    modalidade_frete: "9",
    previsao_entrega: null,
    parcelas: [],
    created_at: "2026-11-10T15:00:00Z",
    updated_at: "2026-11-12T11:54:09Z",
  };
}

function item(id: string, nome: string, quantidade: number): ItemDoPedido {
  return {
    id,
    product_id: null,
    produto_codigo: id,
    produto_nome: nome,
    quantidade,
    preco_unit_cents: 1000,
    desconto_pct: 0,
    subtotal_cents: quantidade * 1000,
    posicao: 1,
  };
}

const ITENS_ANTIGOS = [item("antigo-1", "PRODUTO QUE O MERCOS TIROU", 5)];
const ITENS_NOVOS = [item("novo-1", "PRODUTO QUE O MERCOS COLOCOU", 2)];

function elemento(itens: ItemDoPedido[]) {
  return (
    <DetalheDoPedido
      pedido={pedidoDeTeste("concluido")}
      itens={itens}
      contato={null}
      nomeVendedor={null}
      nomeOrganizacao="Bill Higiene"
      podeEditar
      podeExcluir={false}
      podeSincronizarMercos
    />
  );
}

function renderizar(itens: ItemDoPedido[]) {
  return render(elemento(itens));
}

describe("ficha do pedido — itens atualizados no Mercos", () => {
  beforeEach(() => {
    routerRefresh.mockClear();
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes("/timeline")) return { data: [] } as never;
      if (url.includes("/financeiro/recebiveis")) return { data: [] } as never;
      if (url.includes("/invoices")) return { data: [] } as never;
      // O pedido recarregado: total novo E itens novos, como a rota devolve.
      return { data: { ...pedidoDeTeste("concluido"), itens: ITENS_NOVOS } } as never;
    });
  });

  it("troca a lista de produtos pelo que o recarregar() trouxe", async () => {
    const usuario = userEvent.setup();
    renderizar(ITENS_ANTIGOS);

    expect(screen.getByText("PRODUTO QUE O MERCOS TIROU")).toBeTruthy();

    await usuario.click(screen.getByRole("button", { name: "Editar pedido" }));
    // O botão novo abre as DUAS edições: a de itens e a de detalhes. Os dois
    // "Salvar" continuam separados — gravar itens e detalhes no mesmo PATCH
    // deixaria total velho com item novo se uma das duas metades falhasse.
    expect(screen.getByPlaceholderText("Condição de pagamento")).toBeTruthy();
    await usuario.click(screen.getByRole("button", { name: "salvar-itens" }));

    await waitFor(() => {
      expect(screen.getByText("PRODUTO QUE O MERCOS COLOCOU")).toBeTruthy();
    });
    // O item antigo NÃO pode continuar na tela: é ele que fazia a pessoa
    // achar que a NF-e ia sair com o produto errado.
    expect(screen.queryByText("PRODUTO QUE O MERCOS TIROU")).toBeNull();
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("o servidor continua mandando quando o prop muda de verdade", async () => {
    const vista = renderizar(ITENS_ANTIGOS);
    expect(vista.getByText("PRODUTO QUE O MERCOS TIROU")).toBeTruthy();

    vista.rerender(elemento(ITENS_NOVOS));

    await waitFor(() => {
      expect(vista.getByText("PRODUTO QUE O MERCOS COLOCOU")).toBeTruthy();
    });
    expect(vista.queryByText("PRODUTO QUE O MERCOS TIROU")).toBeNull();
  });
});

/**
 * FATURAR, ENTREGAR E CONCLUIR NÃO PODEM SER CLIQUE SOLTO.
 *
 * A auditoria 5.6 mediu a ficha sem confirmação nas três ações que mudam o
 * estado do pedido sem volta. O teste prova o contrato da TELA: pergunta antes,
 * e recusar não chama a API.
 */
describe("ficha do pedido — confirmação das ações com consequência", () => {
  function buscarPorId(status: PedidoComercial["status"]) {
    return render(
      <DetalheDoPedido
        pedido={pedidoDeTeste(status)}
        itens={ITENS_ANTIGOS}
        contato={null}
        nomeVendedor={null}
        nomeOrganizacao="Bill Higiene"
        podeEditar
        podeExcluir={false}
        podeSincronizarMercos
      />,
    );
  }

  beforeEach(() => {
    confirmarMock.mockReset();
    vi.mocked(apiClient.patch).mockReset();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes("/timeline")) return { data: [] } as never;
      if (url.includes("/financeiro/recebiveis")) return { data: [] } as never;
      if (url.includes("/invoices")) return { data: [] } as never;
      return { data: { ...pedidoDeTeste("rascunho"), itens: ITENS_ANTIGOS } } as never;
    });
  });

  it("faturar pergunta; recusar não chama a API", async () => {
    const usuario = userEvent.setup();
    confirmarMock.mockResolvedValue(false);
    buscarPorId("aprovado");

    await usuario.click(screen.getByRole("button", { name: "Faturar pedido" }));

    expect(confirmarMock).toHaveBeenCalledTimes(1);
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it("marcar entregue pergunta; confirmar manda o status", async () => {
    const usuario = userEvent.setup();
    confirmarMock.mockResolvedValue(true);
    buscarPorId("expedido");

    await usuario.click(screen.getByRole("button", { name: "Marcar entregue" }));

    expect(confirmarMock).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith(`/api/v1/commercial-orders/${PEDIDO_ID}`, {
        status: "entregue",
      }),
    );
  });

  it("concluir pergunta e recusar não fecha a venda", async () => {
    const usuario = userEvent.setup();
    confirmarMock.mockResolvedValue(false);
    buscarPorId("rascunho");

    await usuario.click(screen.getByRole("button", { name: "Marcar como concluído" }));

    expect(confirmarMock).toHaveBeenCalledTimes(1);
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it("aprovar segue em um clique — é o caminho do dia a dia, e o servidor valida a alçada", async () => {
    const usuario = userEvent.setup();
    buscarPorId("rascunho");

    await usuario.click(screen.getByRole("button", { name: "Aprovar pedido" }));

    expect(confirmarMock).not.toHaveBeenCalled();
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalled());
  });
});

/**
 * DECISÃO 6 (20/11/2026) — CUSTO NO RESUMO DO PEDIDO.
 *
 * O resumo mostrava quantidade e valor, não custo/margem. O custo vem do
 * catálogo ATUAL (o item do pedido não guarda o custo da época) e só chega à
 * tela de quem vê margem — `null` significa "não pode ver", e aí o número não
 * aparece. Nada aqui recalcula o valor do pedido.
 */
describe("ficha do pedido — custo e margem no resumo", () => {
  function comCusto(custo: { totalCents: number; semCusto: number } | null) {
    return render(
      <DetalheDoPedido
        pedido={pedidoDeTeste("concluido")}
        itens={ITENS_ANTIGOS}
        contato={null}
        nomeVendedor={null}
        nomeOrganizacao="Bill Higiene"
        podeEditar
        podeExcluir={false}
        podeSincronizarMercos
        custo={custo}
      />,
    );
  }

  it("mostra custo e margem quando quem vê a margem recebe o número", () => {
    comCusto({ totalCents: 10_000, semCusto: 0 });

    expect(screen.getByText(/Custo \(catálogo atual\)/)).toBeTruthy();
    expect(screen.getByText("R$ 100,00")).toBeTruthy();
    expect(screen.getByText(/^Margem:/)).toBeTruthy();
    // Total do pedido de teste é R$ 426,00 → margem R$ 326,00 (76,5%).
    expect(screen.getByText("R$ 326,00")).toBeTruthy();
    expect(screen.getByText("(76.5%)")).toBeTruthy();
  });

  it("custo parcial avisa quantos itens ficaram fora", () => {
    comCusto({ totalCents: 10_000, semCusto: 1 });

    expect(screen.getByText(/1 item sem custo/)).toBeTruthy();
  });

  it("sem permissão (custo null) não mostra custo nem margem", () => {
    comCusto(null);

    expect(screen.queryByText(/Custo \(catálogo atual\)/)).toBeNull();
    expect(screen.queryByText(/^Margem:/)).toBeNull();
    // O resumo que já existia continua inteiro.
    expect(screen.getByText(/Quantidade total/)).toBeTruthy();
    expect(screen.getByText(/Valor total/)).toBeTruthy();
  });
});

describe("ficha do pedido — nota cancelada não deixa o pedido sem saída", () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes("/timeline")) return { data: [] } as never;
      if (url.includes("/financeiro/recebiveis")) return { data: [] } as never;
      if (url.includes("/invoices"))
        return {
          data: [
            {
              id: "n1",
              numero: 4673,
              serie: "1",
              status: "cancelada",
              erro: null,
              chave_acesso: null,
            },
          ],
        } as never;
      return { data: pedidoDeTeste("entregue") } as never;
    });
  });

  it("mostra 'Emitir nova NF-e' quando a única nota está cancelada", async () => {
    renderizar([]);
    expect(await screen.findByRole("button", { name: "Emitir nova NF-e" })).toBeTruthy();
    expect(screen.getByText(/A nota anterior foi cancelada/)).toBeTruthy();
  });
});
