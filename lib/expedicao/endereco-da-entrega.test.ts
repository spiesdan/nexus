/**
 * O ENDEREÇO DE ENTREGA — a regra que impede o papel de dizer "sem endereço".
 *
 * Medido na carga 022: os 22 pedidos tinham `endereco_entrega` NULL, e 21
 * clientes tinham endereço no cadastro. O romaneio mostrava "sem endereço" em
 * toda parada. Este teste prende a precedência: o que foi digitado no pedido
 * vence; o cadastro cobre o resto; CNPJ acha o contato dos importados.
 */
import { describe, expect, it } from "vitest";

import {
  cnpjDoPedido,
  cidadeDaEntrega,
  enderecoDaEntrega,
  nomeDaEntrega,
  type ContatoDaEntrega,
  type ContatosDaEntrega,
} from "./endereco-da-entrega";

const CNPJ = "12.345.678/0001-99";

const contato: ContatoDaEntrega = {
  id: "c1",
  cnpj: "12345678000199",
  name: "PATRICIA DE FATIMA DA SILVA",
  display_name: "PATRICIA DE FATIMA DA SILVA",
  logradouro: "Rua das Flores",
  numero_end: "10",
  complemento: "Sala 2",
  bairro: "Centro",
  cidade: "Mafra",
  uf: "sc",
  cep: "89300000",
};

function mapa(contatos: ContatoDaEntrega[] = []): ContatosDaEntrega {
  return {
    porId: new Map(contatos.map((c) => [c.id, c])),
    porDocumento: new Map(
      contatos
        .filter((c) => cnpjDoPedido(c.cnpj))
        .map((c) => [cnpjDoPedido(c.cnpj) as string, c]),
    ),
  };
}

describe("enderecoDaEntrega", () => {
  it("o endereço digitado no pedido vence o cadastro", () => {
    const linha = enderecoDaEntrega(
      { endereco_entrega: "  Obra na BR-280, km 3  ", contact_id: "c1" },
      mapa([contato]),
    );
    expect(linha).toBe("Obra na BR-280, km 3");
  });

  it("sem endereço no pedido, monta o do cadastro pelo contact_id", () => {
    const linha = enderecoDaEntrega(
      { endereco_entrega: null, contact_id: "c1" },
      mapa([contato]),
    );
    expect(linha).toBe("Rua das Flores, 10 — Sala 2 — Centro, Mafra/SC, 89300000");
  });

  it("importado sem vínculo: acha o contato pelo CNPJ do pedido", () => {
    const linha = enderecoDaEntrega(
      { endereco_entrega: "", contact_id: null, cliente_documento: CNPJ },
      mapa([contato]),
    );
    expect(linha).toBe("Rua das Flores, 10 — Sala 2 — Centro, Mafra/SC, 89300000");
  });

  it("CPF não é usado para procurar contato (contacts.cnpj é CNPJ)", () => {
    expect(cnpjDoPedido("123.456.789-09")).toBeNull();
    const linha = enderecoDaEntrega(
      { contact_id: null, cliente_documento: "123.456.789-09" },
      mapa([contato]),
    );
    expect(linha).toBeNull();
  });

  it("sem nada em lugar nenhum devolve null (a tela decide o texto)", () => {
    expect(enderecoDaEntrega({ endereco_entrega: "   " }, mapa())).toBeNull();
    expect(enderecoDaEntrega({ contact_id: "nao-existe" }, mapa([contato]))).toBeNull();
  });
});

describe("nomeDaEntrega", () => {
  it("vence o nome congelado no pedido quando o cadastro foi renomeado", () => {
    // O caso real do 19341: o pedido ficou com o nome da importação.
    const linha = nomeDaEntrega(
      { cliente_nome: "BILL COMERCIO DE ESTOPAS - PATRICIA DE FATIMA DA SILVA", contact_id: "c1" },
      mapa([contato]),
    );
    expect(linha).toBe("PATRICIA DE FATIMA DA SILVA");
  });

  it("prefere display_name e cai para name", () => {
    const soName = { ...contato, display_name: null };
    expect(nomeDaEntrega({ contact_id: "c1" }, mapa([soName]))).toBe("PATRICIA DE FATIMA DA SILVA");
  });

  it("sem contato, mantém o nome do pedido", () => {
    expect(
      nomeDaEntrega({ cliente_nome: "  CLIENTE DO PEDIDO  ", contact_id: "nao-existe" }, mapa([contato])),
    ).toBe("CLIENTE DO PEDIDO");
  });

  it("sem contato e sem nome no pedido devolve string vazia (a tela decide)", () => {
    expect(nomeDaEntrega({ cliente_nome: null }, mapa())).toBe("");
  });
});

describe("cidadeDaEntrega", () => {
  it("cidade + UF do cadastro viram o rótulo do grupo", () => {
    expect(cidadeDaEntrega({ contact_id: "c1" }, mapa([contato]))).toBe("Mafra/SC");
  });

  it("cidade por extenso não vira UF por adivinhação", () => {
    const extenso = { ...contato, cidade: "Mafra, Santa Catarina", uf: null };
    expect(cidadeDaEntrega({ contact_id: "c1" }, mapa([extenso]))).toBe("Mafra");
  });

  it("sem cidade no cadastro não inventa grupo", () => {
    const semCidade = { ...contato, cidade: null, uf: "SC" };
    expect(cidadeDaEntrega({ contact_id: "c1" }, mapa([semCidade]))).toBeNull();
  });
});
