import { describe, expect, it } from "vitest";

import {
  aceitaResultado,
  classificarResultado,
  consultasDeEmergencia,
  expandirAbreviacoes,
  formatarCep,
  limparComplemento,
  montarConsultas,
  normalizarNumero,
  parseLinhaEndereco,
  ruaSemNumeroColado,
  semConectores,
  semHonorifico,
  semTipoVial,
  variantesDoNome,
} from "./geocodificacao";

describe("normalização da consulta", () => {
  it("número com texto vira dígitos; SN/KM viram nada", () => {
    expect(normalizarNumero("268 sala03")).toBe("268");
    expect(normalizarNumero("65")).toBe("65");
    expect(normalizarNumero("SN")).toBeNull();
    expect(normalizarNumero("S/N")).toBeNull();
    expect(normalizarNumero("KM 258")).toBeNull();
    expect(normalizarNumero(null)).toBeNull();
  });

  it("expande abreviatura sem comer palavra", () => {
    expect(expandirAbreviacoes("R CEL ALBUQUERQUE")).toBe("Rua Coronel ALBUQUERQUE");
    expect(expandirAbreviacoes("RUA DUQUE DE CAXIAS")).toBe("RUA DUQUE DE CAXIAS");
    expect(expandirAbreviacoes("AV. MIGUEL KOMARCHEWSKI")).toBe("Avenida MIGUEL KOMARCHEWSKI");
    expect(expandirAbreviacoes("AV.GOV.Jorge Lacerda")).toBe("Avenida Governador Jorge Lacerda");
    expect(expandirAbreviacoes("RUA MAL FLORIANO PEIXOTO")).toBe("RUA Marechal FLORIANO PEIXOTO");
  });

  it("complemento sai, endereço fica", () => {
    expect(limparComplemento("268 sala03")).toBe("268");
    expect(limparComplemento("LOJA")).toBe("");
    expect(limparComplemento("RUA X, 10 FUNDOS")).toBe("RUA X, 10");
    expect(limparComplemento("CENTRO")).toBe("CENTRO");
    expect(limparComplemento("CORONEL ALBUQUERQUE, 268 sala03, ATÉ 599/600")).toBe(
      "CORONEL ALBUQUERQUE, 268",
    );
    expect(limparComplemento("R VIDAL RAMOS, 1195, SALA PISO SUPERIOR")).toBe("Rua VIDAL RAMOS, 1195");
    expect(limparComplemento("Avenida dos expedicionários, 1259, antiga panif arco iris")).toBe(
      "Avenida dos expedicionários, 1259",
    );
    expect(limparComplemento("R CAETANO COSTA, 739, SALA 01")).toBe("Rua CAETANO COSTA, 739");
    expect(limparComplemento("AV DOS EXPEDICIONARIOS, 3075, CXPST 91")).toBe(
      "Avenida DOS EXPEDICIONARIOS, 3075",
    );
    expect(limparComplemento("ROD. ANTONIO HEIL, n.177, SALA 116")).toBe("Rodovia ANTONIO HEIL, 177");
  });

  it("número colado no logradouro não duplica", () => {
    expect(ruaSemNumeroColado("RUA OROCIMBO CAETANO DA SILVA, 65", "65")).toBe(
      "RUA OROCIMBO CAETANO DA SILVA",
    );
    expect(ruaSemNumeroColado("RUA X", "10")).toBe("RUA X");
  });

  it("cadeia: exata → sem número (sem repetição)", () => {
    const q = montarConsultas({
      logradouro: "R CEL ALBUQUERQUE",
      numero_end: "268 sala03",
      bairro: "LOJA",
      cidade: "Canoinhas",
      uf: "SC",
    });
    // A rua já sai expandida (limparComplemento expande antes).
    expect(q[0]).toBe("Rua Coronel ALBUQUERQUE, 268, Canoinhas, SC, Brasil");
    expect(q).toContain("Rua Coronel ALBUQUERQUE, Canoinhas, SC, Brasil");
    // "LOJA" não entra em nenhuma fase.
    expect(q.every((x) => !x.includes("LOJA"))).toBe(true);
    expect(new Set(q).size).toBe(q.length);
  });

  it("últimas fases: primeiro trecho e sem UF", () => {
    const q = montarConsultas({
      logradouro: "br 280, 6372, systen som",
      numero_end: "6372",
      bairro: null,
      cidade: "Canoinhas",
      uf: "SC",
    });
    expect(q).toContain("br 280, Canoinhas, SC, Brasil");
    expect(q[q.length - 1]).toBe("br 280, Canoinhas, Brasil");
  });

  it("letra solta sai, Rua fica", () => {
    expect(limparComplemento("CAMPOS S SALES")).toBe("CAMPOS SALES");
    expect(limparComplemento("R CEL ALBUQUERQUE")).toBe("Rua Coronel ALBUQUERQUE");
    expect(limparComplemento("RUBENS RIBEIRO DA SILVA, 329, LADO ÍMPAR")).toBe(
      "RUBENS RIBEIRO DA SILVA, 329",
    );
    expect(limparComplemento("JOAO CANDIDO FERREIRA 505 NULL")).toBe("JOAO CANDIDO FERREIRA 505");
    expect(limparComplemento("RUBENS RIBEIRO DA SILVA, 837, ***")).toBe("RUBENS RIBEIRO DA SILVA, 837");
  });

  it("tipo trocado no cadastro: tenta sem tipo (com número)", () => {
    expect(semTipoVial("Avenida Rubens Ribeiro da Silva")).toBe("Rubens Ribeiro da Silva");
    expect(semTipoVial("Rua Caetano Costa")).toBe("Caetano Costa");
    expect(semTipoVial("BR 280")).toBe("BR 280");
    const q = montarConsultas({
      logradouro: "AV RUBENS RIBEIRO DA SILVA, 85, SALA 03",
      numero_end: null,
      bairro: "Campo da Água Verde",
      cidade: "Canoinhas",
      uf: "SC",
    });
    expect(q).toContain("RUBENS RIBEIRO DA SILVA, 85, Campo da Água Verde, Canoinhas, SC, Brasil");
  });

  it("título e conector do cadastro não impedem achar a rua", () => {
    // Medido na carga 039 (12/11/2026): as duas ruas abaixo não existem no OSM
    // com o nome do cadastro, e a cadeia caía no município — pino na Prefeitura.
    expect(semHonorifico("VEREADOR JOAO ALEXANDRINA")).toBe("JOAO ALEXANDRINA");
    expect(semHonorifico("Rua Coronel ALBUQUERQUE")).toBe("Rua Coronel ALBUQUERQUE");
    expect(semConectores("Rua Saulo de Carvalho")).toBe("Rua Saulo Carvalho");
    expect(semConectores("Rua da Paz")).toBe("Rua da Paz");
    expect(variantesDoNome("VEREADOR JOAO ALEXANDRINA")).toEqual([
      "JOAO ALEXANDRINA",
    ]);
    expect(variantesDoNome("Rua Saulo de Carvalho")).toEqual([
      "Rua Saulo Carvalho",
    ]);

    const q = montarConsultas({
      logradouro: "RUA VEREADOR JOAO ALEXANDRINA",
      numero_end: "548",
      bairro: "INDUSTRIAL 1",
      cidade: "Canoinhas",
      uf: "SC",
    });
    expect(q).toContain("JOAO ALEXANDRINA, Canoinhas, SC, Brasil");

    const q2 = montarConsultas({
      logradouro: "R. Saulo de Carvalho",
      numero_end: "1065",
      bairro: "Sossego",
      cidade: "Canoinhas",
      uf: "SC",
    });
    expect(q2).toContain("Saulo Carvalho, Canoinhas, SC, Brasil");
  });

  it("sem rua ou sem cidade não consulta", () => {
    expect(montarConsultas({ logradouro: null, cidade: "Canoinhas", uf: "SC" })).toEqual([]);
    expect(montarConsultas({ logradouro: "RUA X", cidade: null, uf: "SC" })).toEqual([]);
  });

  it("faixa DE..A sem lado também é resto de cadastro", () => {
    expect(limparComplemento("BARÃO DO RIO BRANCO, 771, DE 120/121 A 899/900")).toBe(
      "BARÃO DO RIO BRANCO, 771",
    );
    expect(limparComplemento("RUA DOS EXPEDICIONARIOS")).toBe("RUA DOS EXPEDICIONARIOS");
  });

  it("linha do pedido vira partes (avulso também tem cadeia)", () => {
    expect(parseLinhaEndereco("RUA X, 65 — BAIRRO, CIDADE/UF, 89520000")).toEqual({
      logradouro: "RUA X, 65",
      numero_end: null,
      bairro: "BAIRRO",
      cidade: "CIDADE",
      uf: "UF",
    });
    expect(parseLinhaEndereco("RUA X, 65")).toEqual({
      logradouro: "RUA X, 65",
      numero_end: null,
      bairro: null,
      cidade: null,
      uf: null,
    });
  });
});

describe("ponto de emergência (CEP/município)", () => {
  it("formata CEP de 8 dígitos e recusa o resto", () => {
    expect(formatarCep("89520000")).toBe("89520-000");
    expect(formatarCep("89520-000")).toBe("89520-000");
    expect(formatarCep(" 89380 000 ")).toBe("89380-000");
    expect(formatarCep("8952000")).toBeNull();
    expect(formatarCep("")).toBeNull();
    expect(formatarCep(null)).toBeNull();
  });

  it("bairro primeiro; CEP genérico não vira ponto; município por último", () => {
    // O caso do MATERPLAN (carga 027): a estrada rural não existe no OSM.
    // 89380-000 é CEP genérico do município — o centroide pode cair em
    // qualquer distrito, então a consulta de município é mais honesta.
    expect(consultasDeEmergencia({ cidade: "Monte Castelo", uf: "sc", cep: "89380000" })).toEqual([
      "Monte Castelo, SC, Brasil",
    ]);
    // Carga 039: o bairro existe no OSM e é mais preciso que o município.
    expect(
      consultasDeEmergencia({ bairro: "Sossego", cidade: "Canoinhas", uf: "SC", cep: "89460000" }),
    ).toEqual(["Sossego, Canoinhas, SC, Brasil", "Canoinhas, SC, Brasil"]);
    // CEP específico continua valendo como último recurso antes do município.
    expect(
      consultasDeEmergencia({ bairro: "Industrial 1", cidade: "Canoinhas", uf: "SC", cep: "89462514" }),
    ).toEqual([
      "Industrial 1, Canoinhas, SC, Brasil",
      "89462-514, Brasil",
      "Canoinhas, SC, Brasil",
    ]);
  });

  it("sem CEP sobra o município; sem nada não inventa consulta", () => {
    expect(consultasDeEmergencia({ cidade: "Curitibanos", uf: "SC" })).toEqual([
      "Curitibanos, SC, Brasil",
    ]);
    expect(consultasDeEmergencia({ cidade: null, uf: "SC", cep: "89520000" })).toEqual([
      "89520-000, Brasil",
    ]);
    expect(consultasDeEmergencia({})).toEqual([]);
  });
});

describe("classificarResultado", () => {
  it("imóvel com número é precisão de número", () => {
    expect(
      classificarResultado([
        { lat: "-27.1", lon: "-50.2", addresstype: "house", address: { house_number: "10", road: "Rua X" } },
      ]),
    ).toMatchObject({ estado: "ok", precisao: "numero" });
  });

  it("a mesma rua em todos os candidatos é rua aproximada", () => {
    expect(
      classificarResultado([
        { lat: "-27.1", lon: "-50.2", address: { road: "Rua X", city: "Mafra" } },
        { lat: "-27.2", lon: "-50.3", address: { road: "Rua X", city: "Mafra" } },
      ]),
    ).toMatchObject({ estado: "ok", precisao: "rua" });
  });

  it("CEP é lugar, não rua: precisão de cidade", () => {
    expect(
      classificarResultado([
        { lat: "-26.46", lon: "-50.22", addresstype: "postcode", address: { postcode: "89380-000" } },
      ]),
    ).toMatchObject({ estado: "ok", precisao: "cidade" });
  });

  it("bairro é ponto aproximado de bairro, não de cidade", () => {
    expect(
      classificarResultado([
        { lat: "-27.3", lon: "-50.57", addresstype: "suburb", address: { suburb: "Água Santa" } },
      ]),
    ).toMatchObject({ estado: "ok", precisao: "bairro" });
  });

  it("ruas diferentes na mesma consulta é ambíguo — não escolhe no chute", () => {
    expect(
      classificarResultado([
        { lat: "-27.1", lon: "-50.2", address: { road: "Rua X", city: "Mafra" } },
        { lat: "-27.2", lon: "-50.3", address: { road: "Rua Y", city: "Mafra" } },
      ]),
    ).toMatchObject({ estado: "ambiguo", latitude: null, longitude: null });
  });

  it("lista vazia é não encontrado", () => {
    expect(classificarResultado([])).toMatchObject({ estado: "nao_encontrado" });
    expect(classificarResultado(null)).toMatchObject({ estado: "nao_encontrado" });
  });

  it("coordenadas fora de faixa não viram ponto (lat -90..90, lng -180..180)", () => {
    // Prompt §3/§8 (teste 4): coordenada inválida não é "ok" por não ser null.
    // Antes só se checava finito — um valor fora de faixa entrava como ponto
    // válido e a rota desenhava/motorista ia para lugar nenhum.
    expect(
      classificarResultado([{ lat: "95", lon: "-50.2", addresstype: "house", address: { house_number: "10", road: "Rua X" } }]),
    ).toMatchObject({ estado: "erro", latitude: null, longitude: null });
    expect(
      classificarResultado([{ lat: "-26.4", lon: "200", addresstype: "house", address: { house_number: "10", road: "Rua X" } }]),
    ).toMatchObject({ estado: "erro", latitude: null, longitude: null });
    expect(
      classificarResultado([{ lat: "abc", lon: "-50.2" }]),
    ).toMatchObject({ estado: "erro", latitude: null, longitude: null });
  });
});

describe("aceitaResultado (precisão com número no cadastro)", () => {
  it("com número no cadastro, só imóvel (numero) fecha a fase de rua", () => {
    // Carga 40 (12/11/2026): 19506 e 19542 colapsaram na mesma avenida — com
    // número no cadastro a geometria de rua não é ponto de parada.
    expect(
      aceitaResultado({ estado: "ok", latitude: -26.4154231, longitude: -51.3182519, precisao: "rua" }, true),
    ).toBe(false);
    expect(
      aceitaResultado({ estado: "ok", latitude: -26.4154231, longitude: -51.3182519, precisao: "numero" }, true),
    ).toBe(true);
  });

  it("sem número no cadastro, rua aproximada continua aceita", () => {
    expect(
      aceitaResultado({ estado: "ok", latitude: -26.4154231, longitude: -51.3182519, precisao: "rua" }, false),
    ).toBe(true);
    expect(
      aceitaResultado({ estado: "ok", latitude: -26.4154231, longitude: -51.3182519, precisao: "bairro" }, false),
    ).toBe(false);
  });

  it("não aceita estados não-ok", () => {
    expect(aceitaResultado({ estado: "nao_encontrado", latitude: null, longitude: null, precisao: null }, false)).toBe(false);
    expect(aceitaResultado({ estado: "ambiguo", latitude: null, longitude: null, precisao: null }, false)).toBe(false);
    expect(aceitaResultado({ estado: "erro", latitude: null, longitude: null, precisao: null }, false)).toBe(false);
  });
});
