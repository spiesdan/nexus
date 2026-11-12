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
vi.mock("@/components/nexus-ui/forms/ConfirmacaoProvider", () => ({
  useConfirmar: () => async () => true,
}));
vi.mock("@/components/nexus-ui/layout/NexusPageHeader", () => ({
  NexusPageHeader: () => null,
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

    await usuario.click(screen.getByRole("button", { name: "Adicionar produto ao pedido" }));
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
