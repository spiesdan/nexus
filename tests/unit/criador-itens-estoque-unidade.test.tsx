/**
 * O QUE A LINHA DO ITEM DIZ SOBRE ESTOQUE, UNIDADE E ORIGEM DO PREÇO.
 *
 * B.10: quatro estados distintos — saldo conhecido, sem saldo, insuficiente e
 * não controlado. A tela não promete reserva (ela não existe).
 * B.14: a quantidade é inteira (o schema do pedido é `int().min(1)`), a unidade
 * do produto aparece e o múltiplo é informado; a validação do múltiplo não
 * existe no servidor (decisão pendente, documentada).
 * B.9: a linha diz se o preço veio da base, da tabela ou foi digitado à mão.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OrderItems, type LinhaDoPedido } from "@/app/app/pedidos/novo/_itens";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));

afterEach(() => cleanup());

function linha(over: Partial<LinhaDoPedido>): LinhaDoPedido {
  return {
    key: "l1",
    product_id: "p1",
    codigo: "P1",
    nome: "Produto",
    quantidade: 2,
    permite_fracao: false,
    precoTexto: "10,00",
    descontoPct: 0,
    estoque: 10,
    ...over,
  };
}

describe("OrderItems — estoque, unidade e origem do preço", () => {
  it("distingue os quatro estados de estoque", () => {
    render(
      <OrderItems
        linhas={[
          linha({ key: "a", estoque: null }),
          linha({ key: "b", estoque: 0 }),
          linha({ key: "c", estoque: 1 }),
          linha({ key: "d", estoque: 5 }),
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

  it("mostra a unidade e o múltiplo, e trunca quantidade fracionária", () => {
    const aoMudar = vi.fn();
    render(
      <OrderItems
        linhas={[linha({ unidade: "kg", multiplo: 6 })]}
        aoMudar={aoMudar}
        aoRemover={vi.fn()}
      />,
    );

    expect(screen.getByText("vendido em múltiplos de 6")).toBeTruthy();
    const campo = screen.getByLabelText("Quantidade (kg)") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "1.5" } });

    // O schema do pedido recusa fração; a tela não pode aceitar o que o
    // servidor vai recusar no fim.
    expect(aoMudar).toHaveBeenCalledWith("l1", { quantidade: 1 });
  });

  it("marca a origem do preço: tabela × manual", () => {
    const { unmount } = render(
      <OrderItems
        linhas={[linha({ origemPreco: "tabela" })]}
        aoMudar={vi.fn()}
        aoRemover={vi.fn()}
      />,
    );
    expect(screen.getByText("preço da tabela")).toBeTruthy();
    unmount();

    render(
      <OrderItems
        linhas={[linha({ origemPreco: "manual" })]}
        aoMudar={vi.fn()}
        aoRemover={vi.fn()}
      />,
    );
    expect(screen.getByText("preço manual")).toBeTruthy();
  });
});
