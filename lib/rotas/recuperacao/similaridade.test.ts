import { describe, expect, it } from "vitest";

import {
  compararCep,
  compararComponente,
  extrairCep,
  formatarCep,
  haversineM,
  levenshtein,
  normalizarTexto,
  similaridadeEndereco,
  tokensSimilaridade,
  jaroWinkler,
} from "./similaridade";

/**
 * SIMILARIDADE TEXTUAL — testes puros, sem rede.
 *
 * O Address Recovery Engine depende disso para decidir se um candidato do
 * provedor corresponde ao endereço informado. Cada fase tem um defeito
 * medido que a criou.
 */

describe("normalizarTexto", () => {
  it("remove acento, deixa minúsculo e colapsa espaços", () => {
    expect(normalizarTexto("Rua Coronel Albuquerque, 100")).toBe("rua coronel albuquerque 100");
    expect(normalizarTexto("  Rua   A,   100  ")).toBe("rua a 100");
  });

  it("remove caracteres não alfanuméricos", () => {
    expect(normalizarTexto("R. CEL. ALBUQUERQUE")).toBe("r cel albuquerque");
  });
});

describe("compararComponente", () => {
  it("idêntico após normalização → 1", () => {
    expect(compararComponente("Rua A", "Rua A")).toBe(1);
  });

  it("erro de uma letra ainda dá alto score", () => {
    const s = compararComponente("Albuquerque", "Albuquerque".replace("q", "k"));
    expect(s).toBeGreaterThan(0.8);
  });


  it("texto vazio → null", () => {
    expect(compararComponente("", "Rua A")).toBeNull();
    expect(compararComponente(null, "Rua A")).toBeNull();
    expect(compararComponente("Rua A", null)).toBeNull();
  });

  it("completamente diferente → baixo score", () => {
    expect(compararComponente("Rua A", "XYZW QRS totalmente diferente")).toBeLessThan(0.5);
  });
});

describe("compararCep", () => {
  it("CEP igual → 1", () => {
    expect(compararCep("89460-000", "89460-000")).toBe(1);
  });

  it("mesmo prefixo de 5 → 0.5", () => {
    expect(compararCep("89460-000", "89460-100")).toBe(0.5);
  });

  it("CEP diferente → 0", () => {
    expect(compararCep("89460-000", "89010-000")).toBe(0);
  });

  it("um CEP nulo → null", () => {
    expect(compararCep(null, "89460-000")).toBeNull();
    expect(compararCep("89460-000", null)).toBeNull();
  });

  it("formata CEP com 8 dígitos", () => {
    expect(formatarCep("89520000")).toBe("89520-000");
    expect(formatarCep("89520-000")).toBe("89520-000");
    expect(formatarCep("12345")).toBeNull();
  });

  it("extrairCep acha CEP no texto", () => {
    expect(extrairCep("Rua A, 100, 89460-000")).toBe("89460-000");
    expect(extrairCep("sem cep aqui")).toBeNull();
  });
});

describe("similaridadeEndereco", () => {
  it("tudo igual → score 1", () => {
    const r = similaridadeEndereco(
      { rua: "Rua A", municipio: "Canoinhas", uf: "SC", cep: "89460-000", bairro: "Centro", numero: "100" },
      { rua: "Rua A", municipio: "Canoinhas", uf: "SC", cep: "89460-000", bairro: "Centro", numero: "100" },
    );
    expect(r.score).toBe(1);
  });

  it("erro de uma letra na rua ainda dá score alto", () => {
    const r = similaridadeEndereco(
      { rua: "Rua Albuquerque", municipio: "Canoinhas", uf: "SC" },
      { rua: "Rua Albuquerke", municipio: "Canoinhas", uf: "SC" },
    );
    expect(r.score).toBeGreaterThan(0.8);
  });

  it("município diferente derruba o score", () => {
    const r = similaridadeEndereco(
      { rua: "Rua A", municipio: "Canoinhas", uf: "SC" },
      { rua: "Rua A", municipio: "Joinville", uf: "SC" },
    );
    expect(r.score).toBeLessThan(0.8);
  });

  it("componentes ausentes não punem", () => {
    const r = similaridadeEndereco(
      { rua: "Rua A", municipio: "Canoinhas" },
      { rua: "Rua A", municipio: "Canoinhas" },
    );
    expect(r.score).toBe(1);
  });
});

describe("levenshtein", () => {
  it("idêntico → 1", () => {
    expect(levenshtein("abc", "abc")).toBe(1);
  });

  it("uma letra diferente → alto (strings longas)", () => {
    expect(levenshtein("ABCDEFGH", "ABCDEFGI")).toBeGreaterThan(0.8);
  });

  it("completamente diferente → 0", () => {
    expect(levenshtein("abc", "xyz")).toBe(0);
  });
});

describe("jaroWinkler", () => {
  it("nomes curtos com erro de uma letra", () => {
    expect(jaroWinkler("Canoinhas", "Canoinhas")).toBe(1);
    expect(jaroWinkler("Canoinhas", "Canoinhas".replace("i", "l"))).toBeGreaterThan(0.9);
  });
});

describe("tokensSimilaridade", () => {
  it("mesmas palavras → 1", () => {
    expect(tokensSimilaridade("rua a canoinhas", "canoinhas rua a")).toBe(1);
  });

  it("sem palavras em comum → 0", () => {
    expect(tokensSimilaridade("rua a", "av brasil")).toBe(0);
  });
});

describe("haversineM", () => {

  it("mesmo ponto → 0", () => {
    expect(haversineM(-26.17, -50.39, -26.17, -50.39)).toBe(0);
  });

  it("distância conhecida (aprox. Canoinhas → Joinville)", () => {
    const d = haversineM(-26.1748, -50.3933, -26.3037, -48.8457);
    expect(d).toBeGreaterThan(100_000); // mais de 100 km
    expect(d).toBeLessThan(250_000); // menos de 250 km
  });
});
