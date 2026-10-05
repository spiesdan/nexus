/**
 * "EMITIDO POR" DIZ QUEM EMITIU — NÃO DE ONDE VEIO O PEDIDO.
 *
 * A tela mostrava o badge de origem (`ROTULO_DA_ORIGEM`), ou seja, "emitido
 * por **Vendedor**" para todo pedido criado na mão — o mesmo rótulo para
 * qualquer pessoa da equipe. Este arquivo cerca o card com três frases:
 *
 *  1. Com `emitente_nome` (nome de `created_by`), o card diz a PESSOA.
 *  2. Sem nome (sem service role / linha importada), cai no badge de origem —
 *     degradação declarada, nunca o UUID de quem criou.
 *  3. O botão "Criar com IA no WhatsApp" não está mais na barra de ações.
 *
 * A prova visual é assunto do e2e; aqui se mede o texto que o card imprime.
 */
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PedidoComercial } from "@/lib/schemas/pedidos";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/components/nexus-ui/forms/ConfirmacaoProvider", () => ({ useConfirmar: () => vi.fn() }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
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

function pedido(over: Partial<PedidoComercial> = {}): PedidoComercial {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    numero: 18558,
    contact_id: "22222222-2222-2222-2222-222222222222",
    cliente_nome: "SCHUHMANN",
    cliente_documento: "11.111.111/0001-11",
    created_by: "33333333-3333-3333-3333-333333333333",
    vendedor_user_id: null,
    emitente_nome: null,
    status: "em_analise",
    origem: "vendedor",
    moeda: "BRL",
    subtotal_cents: 13000,
    desconto_cents: 0,
    desconto_pct: null,
    frete_cents: 0,
    total_cents: 13000,
    condicao_pagamento: "30/60",
    price_table_id: null,
    observacoes: null,
    obs_interna: null,
    endereco_entrega: null,
    transportadora_nome: null,
    modalidade_frete: "cif",
    previsao_entrega: null,
    parcelas: [],
    created_at: "2026-10-03T12:00:00Z",
    updated_at: "2026-10-03T12:00:00Z",
    ...over,
  };
}

function montar(pedidos: PedidoComercial[], podeCriar = true) {
  return render(
    <PedidosClient
      inicial={pedidos}
      iniciais={{ status: "", origem: "", vendedor: "", de: "", ate: "" }}
      podeCriar={podeCriar}
      podeExcluir={podeCriar}
      meuId="33333333-3333-3333-3333-333333333333"
      textos={TEXTOS}
    />,
  );
}

describe("o card diz quem EMITIU o pedido", () => {
  it("mostra o nome de quem criou", () => {
    montar([pedido({ emitente_nome: "Daniel" })]);
    expect(screen.getByText(/emitido por Daniel/i)).toBeTruthy();
    expect(screen.queryByText(/emitido por Vendedor/i)).toBeNull();
  });

  it("sem nome a resolver, cai no badge de origem — nunca no UUID", () => {
    montar([pedido({ emitente_nome: null, origem: "vendedor" })]);
    expect(screen.getByText(/emitido por Vendedor/i)).toBeTruthy();
    expect(screen.queryByText(/33333333-3333-3333-3333-333333333333/)).toBeNull();
  });

  it("a barra de ações não oferece mais criar pedido pela IA do WhatsApp", () => {
    montar([pedido({ emitente_nome: "Daniel" })]);
    expect(screen.queryByText(/Criar com IA no WhatsApp/)).toBeNull();
    // O resto da barra continua de pé: se quebrasse aqui, o teste anterior
    // "passaria" com a barra inteira fora do ar.
    expect(screen.getByText(/Criar pedido \/ orçamento/)).toBeTruthy();
  });
});
