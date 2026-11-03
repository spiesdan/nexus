import { describe, expect, it } from "vitest";

import tabela from "./municipios-ibge.json";
import { municipioIbge, normalizarMunicipio } from "./municipio-ibge";

/**
 * A tabela é dado oficial do IBGE (5.571 municípios, baixado em 2026-11-03).
 * O que se testa aqui é a RESOLUÇÃO — o cadastro escreve cidade de vários
 * jeitos e o `cMun` da NF-e é um só. Errar o município é rejeição na SEFAZ.
 */
describe("normalizarMunicipio", () => {
  it("tira acento, caixa e espaço repetido", () => {
    expect(normalizarMunicipio("  São   Bento do Sul ")).toBe("SAO BENTO DO SUL");
    expect(normalizarMunicipio("Mafra")).toBe("MAFRA");
  });
});

describe("municipioIbge", () => {
  it("resolve a cidade com UF no código de 7 dígitos e no nome oficial", () => {
    expect(municipioIbge("Mafra", "SC")).toEqual({ codigo: "4210100", nome: "Mafra", uf: "SC" });
    expect(municipioIbge("Canoinhas", "sc")).toEqual({
      codigo: "4203808",
      nome: "Canoinhas",
      uf: "SC",
    });
  });

  it("aceita o cadastro como ele vem: maiúsculo, com acento e com estado depois da vírgula", () => {
    const esperado = { codigo: "4215802", nome: "São Bento do Sul", uf: "SC" };
    expect(municipioIbge("SÃO BENTO DO SUL", "SC")).toEqual(esperado);
    expect(municipioIbge("Sao Bento do Sul", "SC")).toEqual(esperado);
    // "Mafra, Santa Catarina" — o estado escrito por extenso não é lido como UF,
    // mas a cidade antes da vírgula resolve.
    expect(municipioIbge("Mafra, Santa Catarina", null)).toEqual({
      codigo: "4210100",
      nome: "Mafra",
      uf: "SC",
    });
  });

  it("estado escrito por extenso depois da vírgula vira UF", () => {
    // Medido nesta instalação: o Mercos grava "Cidade, Estado" e deixa a UF
    // vazia. Sem ler o estado, "Irati" ficava ambíguo (PR e SC) e a emissão
    // pedia uma UF que o cadastro já tinha escrito.
    expect(municipioIbge("Irati, Paraná", null)).toEqual({
      codigo: "4110706",
      nome: "Irati",
      uf: "PR",
    });
    expect(municipioIbge("Canoinhas, Santa Catarina", "")?.codigo).toBe("4203808");
    // UF declarada vence o texto: Canoinhas só existe em SC, então com UF "PR"
    // não resolve — em vez de aceitar um par cidade/UF que a SEFAZ recusaria.
    expect(municipioIbge("Canoinhas, Santa Catarina", "PR")).toBeNull();
  });

  it("sem UF só resolve quando o nome é único no país", () => {
    expect(municipioIbge("Canoinhas", null)?.codigo).toBe("4203808");
    expect(municipioIbge("Canoinhas", "")?.codigo).toBe("4203808");
  });

  it("sem UF e com homônimo devolve null — não escolhe no chute", () => {
    // Bom Jesus existe em PI, RN, RS e SC; escolher um seria rejeição na SEFAZ.
    expect(municipioIbge("Bom Jesus", null)).toBeNull();
    expect(municipioIbge("Bom Jesus", "RS")?.codigo).toBe("4302303");
  });

  it("cidade desconhecida, vazia ou UF inválida devolve null", () => {
    expect(municipioIbge("Cidade Que Não Existe", "SC")).toBeNull();
    expect(municipioIbge("", "SC")).toBeNull();
    expect(municipioIbge(null, "SC")).toBeNull();
    expect(municipioIbge("Mafra", "XX")).toBeNull();
  });

  it("a tabela cobre os 5.571 municípios do IBGE", () => {
    // Guarda contra JSON truncado na regeneração: o serviço devolve 5.571.
    expect(Object.keys(tabela)).toHaveLength(5571);
  });
});
