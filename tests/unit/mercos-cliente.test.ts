/**
 * O NOME DO CLIENTE DO MERCOS — cobrado porque já entrou errado em produção.
 *
 * Duas regressões reais, medidas em 07/11/2026:
 *
 *   - pedido 19442 (faturado): cliente virou " LOJA BILL HIGIENE - Concluído";
 *   - pedidos 19472/19473: "R$ 0,00 -  WISNIEVSKI AUTO PECAS" e
 *     "event PRAZO -  WISNIEVSKI AUTO PECAS".
 *
 * A causa é uma só: quando o cliente NÃO tem CNPJ/CPF, o parser do detalhe não
 * achava a âncora do documento e devolvia nome nulo; o importador caía no nome
 * da lista, que vinha com pagamento, status e ícone colados.
 *
 * As linhas abaixo são cópias fiéis do innerText das páginas reais — inclusive
 * os caracteres da área de uso privado que o Material Symbols deixa no texto.
 */
import { describe, expect, it } from "vitest";

import { CONSUMIDOR_FINAL, lerCartao, lerCliente } from "@/workers/mercos/cliente.mjs";

const ICONE = "\uE0B1";

describe("bloco do cliente no detalhe do pedido", () => {
  it("cliente com CPF: razão e fantasia saem das linhas certas (18685)", () => {
    const cliente = lerCliente([
      "Listar todos clientes",
      "NUTRI CAMPO STILL",
      "- AMARILDO JOSE SCHIMBORSKI",
      "- 034.748.849-80",
      `${ICONE} (47) 99672-1829`,
      `${ICONE} amarildojs@yahoo.com.br`,
      `${ICONE} BELA VISTA DO TOLDO , Santa Catarina`,
      "Trocar cliente",
    ]);

    expect(cliente).toEqual({
      razao: "AMARILDO JOSE SCHIMBORSKI",
      documento: "034.748.849-80",
      fantasia: "NUTRI CAMPO STILL",
      telefone: "(47) 99672-1829",
      cidade: "BELA VISTA DO TOLDO , Santa Catarina",
    });
  });

  it("cliente SEM documento: o nome vem da linha depois de 'Listar todos clientes' (19442)", () => {
    const cliente = lerCliente([
      "Listar todos clientes",
      `${ICONE} LOJA BILL HIGIENE`,
      `${ICONE} 3622-7025`,
      `${ICONE} Canoinhas, Santa Catarina`,
      "Trocar cliente",
    ]);

    expect(cliente.razao).toBeNull();
    expect(cliente.documento).toBeNull();
    expect(cliente.fantasia).toBe("LOJA BILL HIGIENE");
    expect(cliente.telefone).toBe("3622-7025");
    expect(cliente.cidade).toBe("Canoinhas, Santa Catarina");
  });

  it("consumidor final sem documento continua tendo nome (19405)", () => {
    const cliente = lerCliente(["Listar todos clientes", "CONSUMIDOR FINAL", "Trocar cliente"]);

    expect(cliente.documento).toBeNull();
    expect(cliente.fantasia).toBe("CONSUMIDOR FINAL");
    expect(cliente.razao).toBeNull();
  });

  it("sem cliente selecionado, nada é inventado (o bloco só tem o ícone)", () => {
    const cliente = lerCliente([
      "Listar todos clientes",
      ICONE,
      "Representada",
      "BILL COMERCIO DE ESTOPAS",
      "- 35.233.142/0001-83",
    ]);

    expect(cliente).toEqual({ razao: null, documento: null, fantasia: null, telefone: null, cidade: null });
  });

  it("cliente cadastrado no CNPJ da própria empresa é consumidor final (14048)", () => {
    // Medido em 05/12/2025: a loja virtual grava o pedido no cadastro da
    // própria empresa ("CLIENTE ONLINE" + CNPJ 35.233.142/0001-83). O nome
    // real do comprador só existe nas Informações Adicionais; o documento da
    // representada não pode virar documento do cliente.
    const cliente = lerCliente(
      [
        "Listar todos clientes",
        "CLIENTE ONLINE",
        "- PATRICIA DE FATIMA DA SILVA",
        "- 35.233.142/0001-83",
        `${ICONE} (47) 9997-2504`,
        `${ICONE} Canoinhas, Santa Catarina`,
        "Trocar cliente",
      ],
      { documentoRepresentada: "35.233.142/0001-83" },
    );

    expect(cliente).toEqual({
      razao: null,
      documento: null,
      fantasia: CONSUMIDOR_FINAL,
      telefone: null,
      cidade: null,
    });
  });

  it("documento diferente do da representada continua sendo o cliente (18685)", () => {
    const cliente = lerCliente(
      [
        "Listar todos clientes",
        "NUTRI CAMPO STILL",
        "- AMARILDO JOSE SCHIMBORSKI",
        "- 034.748.849-80",
        "Trocar cliente",
      ],
      { documentoRepresentada: "35.233.142/0001-83" },
    );

    expect(cliente.razao).toBe("AMARILDO JOSE SCHIMBORSKI");
    expect(cliente.documento).toBe("034.748.849-80");
  });

  it("o escopo para em 'Representada': o CNPJ da própria empresa nunca é o cliente (19438)", () => {
    const cliente = lerCliente([
      "Listar todos clientes",
      "ADRIANA BISON",
      "- 017.724.049-00",
      `${ICONE} (47) 99999-0000`,
      `${ICONE} Canoinhas, Santa Catarina`,
      "Trocar cliente",
      "Representada",
      "BILL COMERCIO DE ESTOPAS",
      "- 35.233.142/0001-83",
    ]);

    expect(cliente.documento).toBe("017.724.049-00");
    expect(cliente.razao).toBe("ADRIANA BISON");
    expect(cliente.fantasia).toBeNull();
  });
});

describe("cartão da lista do Mercos", () => {
  it("não confunde a forma de pagamento com o nome (19433)", () => {
    const cartao = lerCartao([
      "#19433 emitido por VENDEDOR JB",
      "Concluído",
      `${ICONE} ADAO JOSE KAMITEKOSKI`,
      "event AVISTA",
      "R$ 73,00",
    ]);

    expect(cartao).toMatchObject({
      numero: 19433,
      status: "Concluído",
      vendedor_lista: "VENDEDOR JB",
      razao_lista: "ADAO JOSE KAMITEKOSKI",
      fantasia_lista: null,
    });
  });

  it("lê razão e fantasia quando o cartão traz as duas linhas (18592)", () => {
    const cartao = lerCartao([
      "#18592 emitido por ANA",
      "auto_awesome",
      "Faturado Concluído",
      `${ICONE} NEOVIA INFRAESTRUTURA RODOVIARIA LTDA`,
      "NEOVIA ENGENHARIA",
      "event BOLETO 21 DIAS",
      "R$ 659,90",
    ]);

    expect(cartao).toMatchObject({
      numero: 18592,
      vendedor_lista: "ANA",
      razao_lista: "NEOVIA INFRAESTRUTURA RODOVIARIA LTDA",
      fantasia_lista: "NEOVIA ENGENHARIA",
    });
  });

  it("o status nunca vira nome, nem com selo e ícone na frente (19442)", () => {
    const cartao = lerCartao([
      "#19442 emitido por ANA",
      "auto_awesome",
      "Concluído",
      `${ICONE} LOJA BILL HIGIENE`,
      "event AVISTA",
      "R$ 2.504,00",
    ]);

    expect(cartao.razao_lista).toBe("LOJA BILL HIGIENE");
    expect(cartao.fantasia_lista).toBeNull();
  });
});
