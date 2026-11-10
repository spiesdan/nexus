/**
 * O filtro de Vendedor da tela de pedidos lista os vendedores da organização.
 *
 * ═══ O QUE ESTE ARQUIVO TRAVA ═════════════════════════════════════════════

 * O select do filtro só tinha "Todos os vendedores" e "Só meus pedidos" — as
 * vendedores vinham do server component, mas a lista nunca era passada pro
 * client e o select não tinha o que renderizar. Resultado: "não tem nem um
 * vendedor para selecionar" — o operador não conseguia recortar pedidos por
 * vendedor (necessário para o lançamento com campanha Meta a 1 msg/min e para
 * o ranking comercial por vendedor).
 *
 * A lista é a MESMA da tela de Comissões (membros da org com role != viewer,
 * nomes via service role) — este teste trava que ela chega ao select com o
 * rótulo certo, no formato que o filtro grava (`vendedor_user_id`).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/components/nexus-ui/forms/ConfirmacaoProvider", () => ({ useConfirmar: () => vi.fn() }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn() },
}));

import { PedidosClient } from "@/app/app/pedidos/_client";

afterEach(cleanup);

type Textos = ComponentProps<typeof PedidosClient>["textos"];

const TEXTOS: Textos = {
  titulo: "Pedidos",
  subtitulo: "Os pedidos da loja.",
  vazio: "Nenhum pedido ainda",
  vazioDica: "Crie o primeiro pedido no botão acima.",
  novo: "Novo pedido",
  relatorios: "Relatórios",
  todosStatus: "Todos os status",
  todasOrigens: "Todas as origens",
  verPdf: "Ver",
  baixarPdf: "Baixar",
  buscar: "Buscar",
  condicao: "Pagamento",
  valorMin: "Valor mín (R$)",
  valorMax: "Valor máx (R$)",
  meus: "Só meus pedidos",
  salvarFiltro: "Salvar filtro",
  nomeFiltro: "Nome do filtro…",
  statusLabel: "Status",
  avancados: "Filtros avançados",
  limpar: "Limpar filtros",
  salvos: "Filtros salvos",
  excluir: "Excluir",
  tabela: "Tabela",
  quadro: "Quadro",
  cartoes: "Cartões",
  selecionarTodos: "Selecionar todos",
  avancarSelecionados: "Avançar",
  aprovarSelecionados: "Aprovar",
  cancelarSelecionados: "Cancelar",
  excluirSelecionados: "Excluir",
  exportar: "Exportar CSV",
  imprimirSelecionados: "Imprimir",
  duplicar: "Duplicar",
  historico: "Histórico",
  avancar: "Avançar",
  cancelar: "Cancelar",
  verDetalhe: "Detalhe",
};

const VENDEDORES = [
  { user_id: "dddddddd-1111-4111-8111-111111111111", nome: "Ana" },
  { user_id: "dddddddd-2222-4222-8222-222222222222", nome: "" },
];

function montar(vendedores: Array<{ user_id: string; nome: string; mercos?: boolean }>) {
  return render(
    <PedidosClient
      inicial={[]}
      iniciais={{ status: "", origem: "", vendedor: "", de: "", ate: "" }}
      podeCriar={false}
      podeExcluir={false}
      podeImportar={false}
      meuId="33333333-3333-3333-3333-333333333333"
      vendedores={vendedores}
      textos={TEXTOS}
    />,
  );
}

describe("o filtro de Vendedor lista os vendedores da organização", () => {
  it("oferece os vendedores com o nome resolvido — nunca o UUID inteiro", () => {
    montar(VENDEDORES);
    expect(screen.getByText("Ana")).toBeTruthy();
    // Sem nome resolvido, o rótulo curto é a cortesia (mesma regra do card do
    // pedido), não o UUID cheio.
    expect(screen.getByText("dddddddd-2222-4222-8222-222222222222".slice(0, 8))).toBeTruthy();
  });

  it("mantém os destinos que já existiam: todos e só-meus", () => {
    montar(VENDEDORES);
    expect(screen.getByText("Todos os vendedores")).toBeTruthy();
    expect(screen.getByText("Só meus pedidos")).toBeTruthy();
  });

  it("sem vendedores não abre mão do 'todos' — e o vazio não inventa opções", () => {
    montar([]);
    expect(screen.getByText("Todos os vendedores")).toBeTruthy();
    expect(screen.queryByText("Ana")).toBeNull();
  });

  it("traz o vendedor do Mercos que emitiu pedidos — com o nome cru do canal", () => {
    // Vendedor do Mercos sem usuário no CRM: a lista do filtro leva o nome, e a
    // opção não pode descer para o UUID curto.
    montar([{ user_id: "VENDEDOR JB", nome: "VENDEDOR JB", mercos: true }]);
    expect(screen.getByText("VENDEDOR JB")).toBeTruthy();
  });

  it("selecionar o vendedor do Mercos filtra por nome e o rótulo não vira UUID", () => {
    montar([{ user_id: "VENDEDOR JB", nome: "VENDEDOR JB", mercos: true }]);
    const select = screen.getByLabelText("Vendedor") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "VENDEDOR JB" } });
    expect(select.value).toBe("VENDEDOR JB");
    // Rótulo do chip: o nome do vendedor, não o prefixo do UUID.
    expect(screen.getByText("Vendedor: VENDEDOR JB")).toBeTruthy();
  });

  it("selecionar um membro mostra o nome dele, não o id curto", () => {
    montar(VENDEDORES);
    const select = screen.getByLabelText("Vendedor") as HTMLSelectElement;
    fireEvent.change(select, {
      target: { value: "dddddddd-1111-4111-8111-111111111111" },
    });
    expect(screen.getByText("Vendedor: Ana")).toBeTruthy();
    expect(screen.queryByText("Vendedor: dddddddd")).toBeNull();
  });
});
