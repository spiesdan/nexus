import { describe, expect, it } from "vitest";

import { NOMES_DOS_ESTADOS, nomeDoEstado } from "@/lib/format/estados";

/** As 27 unidades federativas do IBGE — 26 estados e o Distrito Federal. */
const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

describe("nomeDoEstado", () => {
  it("traduz a sigla que o Mercos imprime por extenso", () => {
    // É o caso da referência: `Estado: Santa Catarina` na impressão do pedido.
    expect(nomeDoEstado("SC")).toBe("Santa Catarina");
  });

  it("cobre as 27 unidades federativas, e só elas", () => {
    // Fence do vocabulário: uma sigla inventada aqui viraria um estado
    // impresso que não existe, e nada mais no sistema reprovaria.
    expect(Object.keys(NOMES_DOS_ESTADOS).sort()).toEqual([...UFS].sort());
    for (const uf of UFS) {
      expect(nomeDoEstado(uf)).toMatch(/^[A-ZÀ-Ü]/);
    }
  });

  it("aceita a sigla em qualquer caixa e com espaço em volta", () => {
    // `contacts.uf` é texto livre digitado por gente: "sc", " sc " e "SC" são o
    // mesmo estado, e tratar só a forma canônica deixaria metade da base sem
    // nome impresso.
    expect(nomeDoEstado(" sc ")).toBe("Santa Catarina");
    expect(nomeDoEstado("sp")).toBe("São Paulo");
  });

  it("sigla desconhecida devolve null em vez de inventar um nome", () => {
    expect(nomeDoEstado("XX")).toBeNull();
    expect(nomeDoEstado("Santa Catarina")).toBeNull();
    expect(nomeDoEstado("S")).toBeNull();
  });

  it("vazio, nulo ou indefinido devolve null", () => {
    expect(nomeDoEstado("")).toBeNull();
    expect(nomeDoEstado("   ")).toBeNull();
    expect(nomeDoEstado(null)).toBeNull();
    expect(nomeDoEstado(undefined)).toBeNull();
  });
});
