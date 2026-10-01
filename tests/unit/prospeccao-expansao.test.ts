import { beforeEach, describe, expect, it } from "vitest";

import { expansaoLigada, termosDeDescoberta } from "@/lib/prospeccao/expansao";

describe("termosDeDescoberta (CategoryExpansionService, §5)", () => {
  beforeEach(() => {
    delete process.env.PROSPECCAO_EXPANSAO;
  });

  it("sem expansão (default) devolve só a própria categoria — 1:1, mesmo custo de antes", () => {
    expect(termosDeDescoberta("Restaurante")).toEqual([{ rotulo: "Restaurante", termo: "Restaurante" }]);
  });

  it("com expansão, a própria categoria vem primeiro e os irmãos da família depois", () => {
    const termos = termosDeDescoberta("Restaurante", true);
    expect(termos[0]).toEqual({ rotulo: "Restaurante", termo: "Restaurante" });
    const lista = termos.map((t) => t.termo);
    expect(lista).toContain("Pizzaria");
    expect(lista).toContain("Lanchonete");
    expect(new Set(lista).size).toBe(lista.length);
  });

  it("aceita o termo de busca como entrada (alias), não só o rótulo", () => {
    const termos = termosDeDescoberta("clínica veterinária", true);
    expect(termos[0]).toEqual({ rotulo: "Veterinária", termo: "clínica veterinária" });
    expect(termos.length).toBeGreaterThan(1);
  });

  it("categoria fora da biblioteca expande só para si mesma e nunca lança", () => {
    expect(termosDeDescoberta("Fábrica de botão", true)).toEqual([
      { rotulo: "Fábrica de botão", termo: "Fábrica de botão" },
    ]);
  });

  it("liga pela variável de ambiente, como o resto dos knobs de prospecção", () => {
    process.env.PROSPECCAO_EXPANSAO = "true";
    expect(expansaoLigada()).toBe(true);
    expect(termosDeDescoberta("Pizzaria").length).toBeGreaterThan(1);
    process.env.PROSPECCAO_EXPANSAO = "false";
    expect(expansaoLigada()).toBe(false);
    expect(termosDeDescoberta("Pizzaria")).toHaveLength(1);
  });
});
