import { describe, expect, it } from "vitest";

import { comNomeDoContato, nomeDeExibicao } from "@/lib/contacts/nome-de-exibicao";

/**
 * A regra do dono (18/11/2026), presa por valor.
 *
 * "Na busca de cliente e ao adicionar cliente na hora de criar o pedido, o nome
 * que aparece primeiro é o nome fantasia. Se não houver fantasia, aí sim a
 * razão social (PJ) ou o nome (PF)."
 */
describe("nome de exibição do cliente no pedido", () => {
  it("fantasia presente vence razão social", () => {
    expect(
      nomeDeExibicao({
        fantasia: "Bill Higiene",
        display_name: "BILL COMERCIO DE ESTOPAS LTDA",
        name: "BILL COMERCIO DE ESTOPAS LTDA",
      }),
    ).toBe("Bill Higiene");
  });

  it("fantasia vazia ou só espaços cai para a razão social", () => {
    for (const fantasia of ["", "   ", null, undefined]) {
      expect(
        nomeDeExibicao({ fantasia, display_name: "RAZAO SOCIAL LTDA", name: "RAZAO" }),
        `fantasia=${JSON.stringify(fantasia)}`,
      ).toBe("RAZAO SOCIAL LTDA");
    }
  });

  it("sem fantasia nem display_name, pessoa física usa o nome", () => {
    expect(nomeDeExibicao({ fantasia: null, display_name: null, name: "Maria Souza" })).toBe(
      "Maria Souza",
    );
  });

  it("tudo vazio vira 'Sem nome' — nunca string vazia na tela", () => {
    expect(nomeDeExibicao({})).toBe("Sem nome");
    expect(nomeDeExibicao(null)).toBe("Sem nome");
  });

  it("identificador técnico não vira nome, mesmo sem fantasia", () => {
    expect(nomeDeExibicao({ display_name: "Contato 543134@lid", name: "Maria" })).toBe("Maria");
  });

  it("a fantasia é aparada", () => {
    expect(nomeDeExibicao({ fantasia: "  Bill  " })).toBe("Bill");
  });
});

describe("lista de pedidos: nome do contato na leitura, snapshot preservado", () => {
  const contatos = new Map([
    ["c1", { fantasia: "Bill Higiene", display_name: "BILL COMERCIO", name: "BILL" }],
  ]);

  it("pedido com vínculo mostra a fantasia atual, sem tocar no snapshot do banco", () => {
    const pedidos = [{ id: "p1", contact_id: "c1", cliente_nome: "BILL COMERCIO" }];
    const saida = comNomeDoContato(pedidos, contatos);
    expect(saida[0]!.cliente_nome).toBe("Bill Higiene");
    // O objeto de entrada não é mutado: o snapshot que o banco guarda continua
    // sendo o do dia do pedido.
    expect(pedidos[0]!.cliente_nome).toBe("BILL COMERCIO");
  });

  it("pedido sem vínculo mantém o snapshot", () => {
    const pedidos = [{ id: "p2", contact_id: null, cliente_nome: "CLIENTE ANTIGO" }];
    expect(comNomeDoContato(pedidos, contatos)[0]!.cliente_nome).toBe("CLIENTE ANTIGO");
  });

  it("vínculo apontando para contato que não veio na consulta não inventa nome", () => {
    const pedidos = [{ id: "p3", contact_id: "sumiu", cliente_nome: "SNAPSHOT" }];
    expect(comNomeDoContato(pedidos, contatos)[0]!.cliente_nome).toBe("SNAPSHOT");
  });
});
