import { describe, expect, it } from "vitest";

import type { ContatoDaEntrega, PedidoComEndereco } from "./endereco-da-entrega";
import { cidadesDaCarga } from "./cidades-da-carga";

const contato = (
  id: string,
  cidade: string,
  uf: string | null = "SC",
): ContatoDaEntrega => ({ id, cidade, uf });

const contatos = (lista: ContatoDaEntrega[]) => ({
  porId: new Map(lista.map((c) => [c.id, c])),
  porDocumento: new Map<string, ContatoDaEntrega>(),
});

function mapa(pedidos: (PedidoComEndereco & { id: string })[]) {
  return new Map(pedidos.map((p) => [p.id, p]));
}

/**
 * A linha da carga precisa dizer PARA ONDE ela vai — a primeira pergunta que
 * a operação faz. Medido na carga 022: 7 cidades, 22 paradas.
 */
describe("cidadesDaCarga", () => {
  it("lista as cidades na ordem das paradas, sem repetir", () => {
    const r = cidadesDaCarga(
      [{ order_id: "a" }, { order_id: "b" }, { order_id: "c" }, { order_id: "d" }],
      mapa([
        { id: "a", contact_id: "c-canoinhas" },
        { id: "b", contact_id: "c-mafra" },
        { id: "c", contact_id: "c-canoinhas" },
        { id: "d", contact_id: "c-tres" },
      ]),
      contatos([
        contato("c-canoinhas", "Canoinhas"),
        contato("c-mafra", "Mafra"),
        contato("c-tres", "Três Barras"),
      ]),
    );
    expect(r).toEqual({
      cidades: ["Canoinhas/SC", "Mafra/SC", "Três Barras/SC"],
      semCidade: 0,
    });
  });

  it("o endereço digitado à mão no pedido não é fatiado em cidade", () => {
    // O romaneio também não fatia: cidade sai do cadastro, e o texto livre é
    // endereço de entrega, não "logradouro, cidade/UF" padronizado. Inventar um
    // parser aqui faria a linha da carga discordar do papel impresso.
    const r = cidadesDaCarga(
      [{ order_id: "a" }],
      mapa([{ id: "a", contact_id: "c-x", endereco_entrega: "Rua B, 10 — Rio Negro/PR" }]),
      contatos([contato("c-x", "Mafra")]),
    );
    expect(r.cidades).toEqual(["Mafra/SC"]);
  });

  it("parada sem cidade é contada, não escondida", () => {
    const r = cidadesDaCarga(
      [{ order_id: "a" }, { order_id: "b" }, { order_id: "sumiu" }],
      mapa([{ id: "a", contact_id: "c-canoinhas" }, { id: "b", contact_id: null }]),
      contatos([contato("c-canoinhas", "Canoinhas")]),
    );
    expect(r).toEqual({ cidades: ["Canoinhas/SC"], semCidade: 2 });
  });

  it("carga sem itens devolve lista vazia e nenhum aviso de cidade faltando", () => {
    expect(cidadesDaCarga([], new Map(), contatos([]))).toEqual({ cidades: [], semCidade: 0 });
  });
});
