import { describe, expect, it } from "vitest";

import { gerarNomeDaCampanha, nomeSugeridoSeAutomatico } from "./nome-da-campanha";

const c = (...nomes: string[]) => nomes.map((cidade) => ({ cidade }));

describe("gerarNomeDaCampanha", () => {
  it("uma cidade", () => {
    expect(gerarNomeDaCampanha(c("Bituruna"))).toBe("Campanha Bituruna");
  });

  it("duas a quatro cidades, em ordem alfabética pt-BR", () => {
    expect(gerarNomeDaCampanha(c("União da Vitória", "Bituruna"))).toBe(
      "Campanha Bituruna, União da Vitória",
    );
    expect(gerarNomeDaCampanha(c("D", "B", "A", "C"))).toBe("Campanha A, B, C, D");
  });

  it("cinco ou mais: três primeiras + restantes", () => {
    expect(gerarNomeDaCampanha(c("E", "D", "C", "B", "A"))).toBe("Campanha A, B, C +2");
    expect(gerarNomeDaCampanha(c("F", "E", "D", "C", "B", "A"))).toBe("Campanha A, B, C +3");
  });

  it("dedupe case-insensitive mantendo o casing da primeira ocorrência", () => {
    expect(gerarNomeDaCampanha(c("bituruna", "Bituruna", "BITURUNA"))).toBe("Campanha bituruna");
    expect(gerarNomeDaCampanha(c("Bituruna", "bituruna"))).toBe("Campanha Bituruna");
  });

  it("normaliza espaços e ignora cidade vazia", () => {
    expect(gerarNomeDaCampanha(c("  São   Paulo  ", " ", ""))).toBe("Campanha São Paulo");
  });

  it("acentos ordenam como pt-BR (Á antes de B)", () => {
    expect(gerarNomeDaCampanha(c("Bituruna", "Água Doce"))).toBe("Campanha Água Doce, Bituruna");
  });

  it("nome longo trunca em limite de palavra e nunca passa de 80", () => {
    const nome = gerarNomeDaCampanha(
      c(
        "Bom Jesus do Itabapoana",
        "Cachoeiro de Itapemirim",
        "Dores do Rio Preto",
        "Espera Feliz",
      ),
    );
    expect(nome.endsWith("…")).toBe(true);
    expect(Array.from(nome).length).toBeLessThanOrEqual(80);
    // O último caractere antes da reticência é o fim de uma palavra (o corte
    // não deixou uma sílaba solta).
    expect(nome.slice(0, -1).trimEnd()).toMatch(/[A-Za-zÀ-ÿ]$/);
  });

  it("sem cidade não inventa nome", () => {
    expect(gerarNomeDaCampanha([])).toBe("");
  });
});

describe("nomeSugeridoSeAutomatico (D-02)", () => {
  it("nome manual nunca é sobrescrito", () => {
    expect(
      nomeSugeridoSeAutomatico({ nomeManual: true, publico: "empresas", cidades: c([] as never) }),
    ).toBeNull();
  });

  it("nome automático é regenerado pela seleção", () => {
    expect(
      nomeSugeridoSeAutomatico({
        nomeManual: false,
        publico: "empresas",
        cidades: c("Bituruna", "Água Doce"),
      }),
    ).toBe("Campanha Água Doce, Bituruna");
  });

  it("recuperação não tem cidade: o automático é vazio", () => {
    expect(
      nomeSugeridoSeAutomatico({ nomeManual: false, publico: "inativos", cidades: [] }),
    ).toBe("");
  });
});
