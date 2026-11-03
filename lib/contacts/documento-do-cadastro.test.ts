import { describe, expect, it } from "vitest";

import {
  documentoDigitos,
  documentoDoCadastro,
  formatarDocumento,
} from "./documento-do-cadastro";

/**
 * O CPF do cliente do Mercos NÃO está em `contacts.cnpj` — está em
 * `source_metadata.mercos.documento`, com máscara. Medido nesta instalação
 * (2026-11-03): 917 contatos com CPF, 907 deles com a coluna vazia.
 */
describe("documentoDoCadastro", () => {
  it("lê a coluna cnpj quando ela tem CNPJ", () => {
    expect(documentoDoCadastro({ cnpj: "27493187000169" })).toEqual({
      digitos: "27493187000169",
      tipo: "CNPJ",
    });
  });

  it("lê o CPF que o Mercos deixou nos metadados, com ou sem máscara", () => {
    const doMercos = (documento: string) => ({
      cnpj: null,
      source_metadata: { mercos: { documento } },
    });
    expect(documentoDoCadastro(doMercos("42040906991"))).toEqual({
      digitos: "42040906991",
      tipo: "CPF",
    });
    expect(documentoDoCadastro(doMercos("420.409.069-91"))).toEqual({
      digitos: "42040906991",
      tipo: "CPF",
    });
  });

  it("a coluna vence o metadado: correção feita à mão não é sobrescrita", () => {
    expect(
      documentoDoCadastro({
        cnpj: "27493187000169",
        source_metadata: { mercos: { documento: "42040906991" } },
      })?.digitos,
    ).toBe("27493187000169");
  });

  it("o tipo declarado manda no rótulo", () => {
    expect(
      documentoDoCadastro({ cnpj: null, tipo_pessoa: "F", source_metadata: { mercos: { documento: "42040906991" } } })
        ?.tipo,
    ).toBe("CPF");
    // Declarado "J" com 11 dígitos continua CNPJ — dado inconsistente não é
    // motivo para trocar o rótulo que o cadastro afirmou.
    expect(documentoDoCadastro({ cnpj: "42040906991", tipo_pessoa: "J" })?.tipo).toBe("CNPJ");
  });

  it("documento pela metade ou ausente devolve null, em vez de mandar assim", () => {
    expect(documentoDoCadastro(null)).toBeNull();
    expect(documentoDoCadastro({})).toBeNull();
    expect(documentoDoCadastro({ cnpj: "123" })).toBeNull();
    expect(documentoDoCadastro({ cnpj: "1234567890123" })).toBeNull();
    expect(documentoDoCadastro({ source_metadata: { mercos: { documento: "" } } })).toBeNull();
    expect(documentoDoCadastro({ source_metadata: "texto" })).toBeNull();
    expect(documentoDoCadastro({ source_metadata: { mercos: { documento: 42 } } })).toBeNull();
  });

  it("os metadados de outra origem não são lidos como documento", () => {
    // `whatsapp` e `manual` também gravam metadados; só `mercos.documento` é
    // documento — inventar chave aqui seria pior que não achar.
    expect(
      documentoDoCadastro({ source_metadata: { whatsapp: { documento: "42040906991" } } }),
    ).toBeNull();
  });

  it("documentoDigitos é o atalho sem rótulo", () => {
    expect(documentoDigitos({ cnpj: "27493187000169" })).toBe("27493187000169");
    expect(documentoDigitos({})).toBeNull();
  });
});

describe("formatarDocumento", () => {
  it("formata CPF e CNPJ para leitura na ficha do cliente", () => {
    expect(formatarDocumento({ digitos: "42040906991", tipo: "CPF" })).toBe("420.409.069-91");
    expect(formatarDocumento({ digitos: "27493187000169", tipo: "CNPJ" })).toBe(
      "27.493.187/0001-69",
    );
  });

  it("tamanho que não casa com o tipo não é formatado no chute", () => {
    expect(formatarDocumento({ digitos: "42040906991", tipo: "CNPJ" })).toBe("42040906991");
  });
});
