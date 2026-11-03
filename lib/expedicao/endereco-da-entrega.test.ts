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
  enderecoDaEntrega,
  type ContatoDaEntrega,
  type ContatosDaEntrega,
} from "./endereco-da-entrega";

const CNPJ = "12.345.678/0001-99";

const contato: ContatoDaEntrega = {
  id: "c1",
  cnpj: "12345678000199",
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
