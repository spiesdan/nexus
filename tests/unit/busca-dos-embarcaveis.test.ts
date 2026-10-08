/**
 * A BUSCA DA CARGA PRECISA ACHAR O PEDIDO QUE A PESSOA LEMBRA.
 *
 * Os casos aqui não são inventados: as linhas de `pedidos` são as que existem
 * na instalação real, com o `endereco_entrega` do jeito que o sistema grava
 * (texto livre, cidade no meio, acentuação e caixa variadas). Um filtro testado
 * com "Pedido Teste, Cidade Teste" passa e não serve para nada.
 */
import { describe, expect, it } from "vitest";

import { chaveDeBusca, filtrarEmbarcaveis } from "@/lib/expedicao/buscar-embarcavel";

/** Copiado do `product`/pedido real: número, nome, documento e endereço como estão. */
const PEDIDOS = [
  {
    numero: 18558,
    cliente_nome: "17.166.775 MARCIA REGINA PEREIRA DOS ANJOS",
    cliente_documento: null,
    endereco_entrega: "Rua Evaristo da Veiga, 653, CASA — Ponta Grossa/PR",
  },
  {
    numero: 18540,
    cliente_nome: "Ana Ferreira — Distribuidora Ferreira",
    cliente_documento: "12345678000199",
    endereco_entrega: "Rua do Comércio, 88, centro — São Paulo/SP",
  },
  {
    numero: 18459,
    cliente_nome: "SCHUHMANN AUTO CENTER - SCHUHMANN SERVICOS AUTOMOTIVOS LTDA",
    cliente_documento: null,
    endereco_entrega:
      "RUA OROCIMBO CAETANO DA SILVA, 65 — VILA NOSSA SENHORA APARECIDA, Curitibanos/SC, 89520000",
  },
  {
    numero: 18457,
    cliente_nome: "Mecânica do ville - VILIBALDO PUBLITZ",
    cliente_documento: null,
    endereco_entrega:
      "ESTRADA LOCALIDADE DE MARMELEIRO, SN, SALA, SN — AREA RURAL, REBOUCAS/PR, 84550000",
  },
  {
    numero: 18456,
    cliente_nome: "LUCAS CENTRO AUTOMOTIVO - LUCAS WELITON PETROSKI 06840944956",
    cliente_documento: null,
    endereco_entrega: "RUA CORONEL JOAO PEDRO MARTINS, 1429 — CENTRO, PRUDENTOPOLIS/PR, 84400000",
  },
];

const nums = (b: string) => filtrarEmbarcaveis(PEDIDOS, b).map((p) => p.numero);

describe("busca dos embarcaveis", () => {
  it("campo vazio devolve a lista inteira — busca vazia não esconde pedido", () => {
    expect(filtrarEmbarcaveis(PEDIDOS, "")).toHaveLength(PEDIDOS.length);
    expect(filtrarEmbarcaveis(PEDIDOS, "   ")).toHaveLength(PEDIDOS.length);
  });

  it("acha pelo número cru, que é o que se digita", () => {
    expect(nums("18558")).toEqual([18558]);
    expect(nums("184")).toEqual([18459, 18457, 18456]);
  });

  it("acha pelo número com o prefixo que aparece na tela", () => {
    expect(nums("PED-18558")).toEqual([18558]);
    // Minúscula: no celular o teclado alterna maiúsculas sozinho.
    expect(nums("ped-18540")).toEqual([18540]);
  });

  it("acha a cidade SEM acento — o dado tem, a digitação não", () => {
    expect(nums("sao paulo")).toEqual([18540]);
    expect(nums("São Paulo")).toEqual([18540]);
    expect(nums("SAO PAULO")).toEqual([18540]);
  });

  it("acha a cidade com acento também", () => {
    expect(nums("Ponta Grossa")).toEqual([18558]);
    expect(nums("curitibanos")).toEqual([18459]);
  });

  it("acha cidade em caixa ALTA no dado — REBOUCAS/PR", () => {
    // O dado real grava `REBOUCAS/PR` em caixa alta e `Ponta Grossa/PR` em
    // caixa normal, na mesma coluna. A comparação é sem caixa.
    expect(nums("reboucas")).toEqual([18457]);
    expect(nums("prudENTOPOLIS")).toEqual([18456]);
  });

  it("acha pelo nome do cliente, sem acento e sem diferenciar caixa", () => {
    expect(nums("mecanica do ville")).toEqual([18457]);
    expect(nums("SCHUHMANN")).toEqual([18459]);
    expect(nums("ana ferreira")).toEqual([18540]);
  });

  it("acha pelo CNPJ/CPF do cliente", () => {
    expect(nums("12345678000199")).toEqual([18540]);
    // Parcial também: o balcão digita os primeiros dígitos.
    expect(nums("12345678")).toEqual([18540]);
  });

  it("acha pelo bairro/rua, que é como a pessoa lembra quando esquece a cidade", () => {
    // A cidade não é campo: mora dentro do endereço. Achar pela rua é de brinde
    // e é o que salva quando a pessoa lembra do lugar e não do nome.
    expect(nums("Evaristo")).toEqual([18558]);
    expect(nums("APARECIDA")).toEqual([18459]);
  });

  it("busca que não casa devolve lista vazia — e não a lista toda", () => {
    expect(nums("cidade que nao existe")).toEqual([]);
    expect(nums("zzzz")).toEqual([]);
  });

  it("espaço dobrado não impede o achado", () => {
    expect(nums("Ana   Ferreira")).toEqual([18540]);
  });

  it("null em nome/endereço não quebra a busca", () => {
    const comNulos = [
      { numero: 1, cliente_nome: null, cliente_documento: null, endereco_entrega: null },
      { numero: 2, cliente_nome: "João da Silva", cliente_documento: null, endereco_entrega: null },
    ];
    expect(filtrarEmbarcaveis(comNulos, "joao")).toEqual([comNulos[1]]);
    expect(filtrarEmbarcaveis(comNulos, "1")).toEqual([comNulos[0]]);
    // Sem acento e com acento: os dois precisam achar o mesmo João.
    expect(filtrarEmbarcaveis(comNulos, "joão")).toEqual([comNulos[1]]);
  });
});

describe("chaveDeBusca", () => {
  it("tira acento, caixa e espaço extra", () => {
    expect(chaveDeBusca("  São   PAULO ")).toBe("sao paulo");
    expect(chaveDeBusca("Mecânica")).toBe("mecanica");
  });

  it("não quebra com null/undefined", () => {
    expect(chaveDeBusca(null)).toBe("");
    expect(chaveDeBusca(undefined)).toBe("");
  });

  it("acento somado com cedilha: `Ç` precisa virar `c`, senão a busca falha", () => {
    // `\p{Diacritic}` cobre o til da cedilha — `normalize("NFD")` separa o `Ç`
    // em `C` + til. A classe antiga `/[̀-ͯ]/` também cobre, mas o teste
    // trava o comportamento em vez de confiar na classe.
    expect(chaveDeBusca("CONCEIÇÃO")).toBe("conceicao");
  });
});
