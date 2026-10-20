/**
 * A AUDITORIA NÃO PODE MANDAR A EMPRESA PARA A MACRO ERRADA.
 *
 * Medido na base de Fraiburgo/Canoinhas: "Gun shop" e "Electrical repair shop"
 * não estão na tabela PT; a macro era escolhida por sobreposição de token, e
 * "shop" casava com "Pet shop". "Automóveis" casava com "Móveis" pelo mesmo
 * motivo. A pergunta da IA é estreita de propósito — se a macro entra errada,
 * a resposta certa nem está entre as opções.
 */
import { describe, expect, it } from "vitest";

import { candidatosDa } from "@/scripts/auditar-categoria-prospeccao-laya";

const linha = (over: Record<string, unknown>) =>
  ({
    id: "id",
    nome: "Empresa",
    categoria: null,
    categorias: null,
    cidade: "Fraiburgo",
    estado: "SC",
    website: null,
    categoria_canonica: null,
    categoria_revisar: true,
    ...over,
  }) as never;

describe("candidatosDa — macro só de rótulo conhecido", () => {
  it("Gun shop com nome de agropecuária não vira Pet shop", () => {
    const c = candidatosDa(linha({ nome: "Agropecuária CresBal", categoria: "Gun shop", categorias: ["Gun shop"] }));
    expect(c).toContain("Agropecuária");
    expect(c).not.toContain("Pet shop");
  });

  it("Electrical repair shop com nome de material elétrico não vira Pet shop", () => {
    const c = candidatosDa(
      linha({ nome: "Fortes Materiais Eletricos", categoria: "Electrical repair shop", categorias: ["Electrical repair shop"] }),
    );
    expect(c).toContain("Elétrica e hidráulica");
    expect(c).not.toContain("Pet shop");
  });

  it("Store com 'Automóveis' não vira Marcenaria: o sinal é 'Móveis', não 'móveis' dentro de outra palavra", () => {
    expect(candidatosDa(linha({ nome: "Iris Automóveis Ltda", categoria: "Store", categorias: ["Store"] }))).toEqual([
      "revisar",
    ]);
  });

  it("Store com 'Móveis' de verdade vira Marcenaria", () => {
    const c = candidatosDa(linha({ nome: "Gabani Móveis Sob Medida", categoria: "Store", categorias: ["Store"] }));
    expect(c).toContain("Marcenaria");
  });
});
