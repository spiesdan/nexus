/**
 * O SELETOR DE CIDADE FALA IBGE, NÃO TEXTO LIVRE.
 *
 * Medido na instalação real (org `4bc721ce…`): **162 valores distintos** de
 * `cidade`, incluindo `CANOINHAS`, `Canoinhas` e `canoinhas` como três opções e
 * `AGROCOMERCIAL SCHULTZ LTDA ME` — nome de empresa no campo de cidade. O
 * filtro listava o valor cru e não conseguia casar as grafias.
 *
 * O contrato agora:
 *  1. só entra o que `municipioIbge(cidade, uf)` resolve (tabela oficial, 5.571
 *     municípios) — empresa, bairro e erro de digitação ficam de fora e são
 *     CONTADOS em `sem_municipio`;
 *  2. as grafias cruas do mesmo município viram UMA opção (`Canoinhas/SC`) e
 *     todas ficam em `variantes` — é o que o filtro usa no `IN`;
 *  3. ordem alfabética pt-BR do rótulo, acento na posição certa.
 */
import { describe, expect, it } from "vitest";

import { cidadesCanonicas } from "@/lib/contacts/cidades";

describe("cidadesCanonicas", () => {
  it("agrupa as grafias de caixa no município do IBGE e guarda as variantes", () => {
    const { cidades } = cidadesCanonicas([
      { cidade: "CANOINHAS", uf: "SC" },
      { cidade: "Canoinhas", uf: "SC" },
      { cidade: "canoinhas", uf: "SC" },
      { cidade: "Mafra", uf: "SC" },
    ]);

    expect(cidades.map((c) => c.rotulo)).toEqual(["Canoinhas/SC", "Mafra/SC"]);
    expect(cidades[0]?.variantes).toHaveLength(3);
    expect(cidades[0]?.variantes).toEqual(
      expect.arrayContaining(["CANOINHAS", "Canoinhas", "canoinhas"]),
    );
  });

  it("nome de empresa NÃO vira cidade — e é contado em sem_municipio", () => {
    const { cidades, sem_municipio } = cidadesCanonicas([
      { cidade: "CANOINHAS", uf: "SC" },
      { cidade: "AGROCOMERCIAL SCHULTZ LTDA ME", uf: "SC" },
      { cidade: "Centro", uf: "SC" },
    ]);

    expect(cidades.map((c) => c.rotulo)).toEqual(["Canoinhas/SC"]);
    expect(sem_municipio).toBe(2);
  });

  it("conta contato sem cidade (null, vazio e só-espaços) em sem_municipio", () => {
    const { cidades, sem_municipio } = cidadesCanonicas([
      { cidade: null, uf: null },
      { cidade: "", uf: "SC" },
      { cidade: "   ", uf: "SC" },
      { cidade: "Mafra", uf: "SC" },
    ]);

    expect(cidades.map((c) => c.rotulo)).toEqual(["Mafra/SC"]);
    expect(sem_municipio).toBe(3);
  });

  it("acento não separa o mesmo município: União da Vitória e UNIAO DA VITORIA", () => {
    const { cidades } = cidadesCanonicas([
      { cidade: "União da Vitória", uf: "PR" },
      { cidade: "UNIAO DA VITORIA", uf: "PR" },
      { cidade: "  União  da  Vitória ", uf: "PR" },
    ]);

    expect(cidades).toHaveLength(1);
    expect(cidades[0]?.rotulo).toBe("União da Vitória/PR");
    // A variante com espaços internos repetidos é normalizada antes de entrar.
    expect(cidades[0]?.variantes).toEqual(
      expect.arrayContaining(["União da Vitória", "UNIAO DA VITORIA"]),
    );
    expect(cidades[0]?.variantes).toHaveLength(2);
  });

  it("resolve cidade com o estado por extenso no mesmo campo", () => {
    const { cidades, sem_municipio } = cidadesCanonicas([
      { cidade: "Mafra, Santa Catarina", uf: null },
    ]);
    expect(sem_municipio).toBe(0);
    expect(cidades[0]?.rotulo).toBe("Mafra/SC");
  });

  it("ordena em pt-BR pelo rótulo, com acento na posição certa", () => {
    const { cidades } = cidadesCanonicas([
      { cidade: "Mafra", uf: "SC" },
      { cidade: "Água Branca", uf: "PI" },
      { cidade: "Canoinhas", uf: "SC" },
    ]);
    expect(cidades.map((c) => c.rotulo)).toEqual(["Água Branca/PI", "Canoinhas/SC", "Mafra/SC"]);
  });
});
