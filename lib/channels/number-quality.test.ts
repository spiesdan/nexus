import { describe, expect, it } from "vitest";

import {
  degrauDoLimite,
  limiteCaiu,
  motivoDaPausaPorLimite,
  motivoDaPausaPorQualidade,
  normalizarQualidade,
} from "./number-quality";

describe("normalizarQualidade", () => {
  it("aceita o vocabulário da plataforma em qualquer caixa e com espaço", () => {
    expect(normalizarQualidade("GREEN")).toBe("GREEN");
    expect(normalizarQualidade(" red ")).toBe("RED");
    expect(normalizarQualidade("Yellow")).toBe("YELLOW");
    expect(normalizarQualidade("UNKNOWN")).toBe("UNKNOWN");
  });

  it("texto inesperado vira null — não inventa UNKNOWN", () => {
    // "não sei" (null) e "a plataforma disse que não há nota" (UNKNOWN) são
    // estados diferentes: gravar UNKNOWN para lixo transformaria ausência de
    // informação em afirmação.
    expect(normalizarQualidade("VERDE")).toBeNull();
    expect(normalizarQualidade("")).toBeNull();
    expect(normalizarQualidade(null)).toBeNull();
    expect(normalizarQualidade(undefined)).toBeNull();
    expect(normalizarQualidade(3)).toBeNull();
  });
});

describe("degrauDoLimite", () => {
  it("ordena os degraus do piso ao topo", () => {
    expect(degrauDoLimite("TIER_NOT_SET")).toBe(0);
    expect(degrauDoLimite("TIER_50")).toBe(1);
    expect(degrauDoLimite("TIER_UNLIMITED")).toBe(6);
  });

  it("degrau desconhecido não tem posição — e não vira zero", () => {
    expect(degrauDoLimite("TIER_ZOOM")).toBeNull();
    expect(degrauDoLimite(null)).toBeNull();
    expect(degrauDoLimite(50)).toBeNull();
  });
});

describe("limiteCaiu", () => {
  it("detecta a QUEDA, que é a penalidade", () => {
    expect(limiteCaiu("TIER_10K", "TIER_2K")).toBe(true);
    expect(limiteCaiu("TIER_2K", "TIER_10K")).toBe(false);
    expect(limiteCaiu("TIER_2K", "TIER_2K")).toBe(false);
  });

  it("sem os dois lados conhecidos, não autoriza mexer em campanha", () => {
    // Fail-closed é para o gate de ENVIO. Pausar por suposição pararia a
    // operação com base num valor que ninguém sabe ler.
    expect(limiteCaiu(null, "TIER_50")).toBe(false);
    expect(limiteCaiu("TIER_50", null)).toBe(false);
    expect(limiteCaiu("TIER_50", "TIER_INDEFINIDO")).toBe(false);
  });
});

describe("motivos da pausa", () => {
  it("nomeiam o número e o próximo passo, não só o código", () => {
    const qualidade = motivoDaPausaPorQualidade("RED", "Matriz");
    expect(qualidade).toContain('"Matriz"');
    expect(qualidade).toContain("RED");
    expect(qualidade).toContain("GREEN");

    const limite = motivoDaPausaPorLimite("TIER_10K", "TIER_2K", "Matriz");
    expect(limite).toContain("TIER_10K");
    expect(limite).toContain("TIER_2K");
    expect(limite).toContain("compartilhado");
  });
});
