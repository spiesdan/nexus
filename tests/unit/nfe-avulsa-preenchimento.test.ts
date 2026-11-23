/**
 * A VENDA AVULSA NÃO PODE PERDER O DOCUMENTO DO CADASTRO.
 *
 * Medido na instalação: 907 contatos têm CPF só em
 * `source_metadata.mercos.documento`, com `cnpj` vazio. A tela de avulsa lia
 * só `cnpj`, preenchia o destinatário pela metade e emitia com CPF em branco.
 * Este teste trava que o cliente usa a MESMA regra do pedido
 * (`montarDestinatario` + `documentoDoCadastro`), e que o digitado vence.
 */
import { describe, expect, it } from "vitest";

import { camposDaAvulsa, precedenciaDigitado } from "@/lib/fiscal/avulsa-preenchimento";
import type { ContatoFiscal } from "@/lib/fiscal/destinatario-da-nota";

const ID = "11111111-1111-4111-8111-111111111111";

const COM_CPF_NO_METADADO: ContatoFiscal = {
  id: ID,
  name: "Maria",
  display_name: "Maria da Silva",
  cnpj: null,
  tipo_pessoa: "FISICA",
  source_metadata: { mercos: { documento: "420.409.069-91" } },
  ie: null,
  logradouro: "Rua das Flores",
  numero_end: "123",
  bairro: "Centro",
  cidade: "Mafra",
  uf: "SC",
  cep: "89300-000",
};

describe("preenchimento da NF-e avulsa a partir do cadastro", () => {
  it("lê o CPF do source_metadata e preenche destinatário e entrega com a regra do pedido", () => {
    const { campos, faltando } = camposDaAvulsa(COM_CPF_NO_METADADO, "Maria da Silva");

    expect(campos.cliente_documento).toBe("42040906991");
    expect(campos.destinatarioDocumento).toBe("42040906991");
    expect(campos.cliente_nome).toBe("Maria da Silva");
    expect(campos.destinatarioNome).toBe("Maria da Silva");
    expect(campos.entregaLogradouro).toBe("Rua das Flores");
    expect(campos.entregaNumero).toBe("123");
    expect(campos.entregaBairro).toBe("Centro");
    expect(campos.entregaUf).toBe("SC");
    expect(campos.entregaCep).toBe("89300000");
    expect(campos.entregaCodigoMunicipio).toMatch(/^\d{7}$/);
    expect(faltando).toEqual([]);
  });

  it("a coluna cnpj corrigida à mão vence o metadado (sem segunda regra)", () => {
    const { campos } = camposDaAvulsa(
      { ...COM_CPF_NO_METADADO, cnpj: "27.493.187/0001-69" },
      "Maria da Silva",
    );
    expect(campos.cliente_documento).toBe("27493187000169");
  });

  it("cadastro sem endereço devolve pendência nomeada, não entrega inventada", () => {
    const { campos, faltando } = camposDaAvulsa(
      { id: ID, display_name: "Sem Endereço", source_metadata: null },
      "Sem Endereço",
    );

    expect(faltando).toContain("logradouro");
    expect(faltando).toContain("CPF/CNPJ");
    expect(campos.entregaLogradouro).toBe("");
    expect(campos.entregaCodigoMunicipio).toBe("");
  });

  it("o que foi digitado vence o cadastro; o vazio cai no cadastro", () => {
    expect(precedenciaDigitado("   ", "do cadastro")).toBe("do cadastro");
    expect(precedenciaDigitado("corrigido pelo operador", "do cadastro")).toBe(
      "corrigido pelo operador",
    );
  });
});
