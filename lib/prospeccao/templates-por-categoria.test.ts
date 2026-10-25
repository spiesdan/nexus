/**
 * O MODELO POR CATEGORIA (0285) — a leitura do jsonb e o lookup do motor.
 *
 * O array chega do banco como `unknown`. Um item torto não pode derrubar o
 * tick nem virar um bind pela metade: a Meta aceita o POST e recusa a entrega,
 * que é o pior lugar para descobrir.
 */
import { describe, expect, it } from "vitest";

import {
  categoriasSemModelo,
  chaveDaCategoria,
  lerTemplatesPorCategoria,
  resumoDosTemplatesPorCategoria,
  templateDaCategoria,
} from "./templates-por-categoria";

const bind = (categoria: string, name = "modelo") => ({
  categoria,
  name,
  language: "pt_BR",
  contract_hash: `hash-${name}`,
  values: {},
});

describe("lerTemplatesPorCategoria", () => {
  it("descarta item incompleto em vez de virar bind pela metade", () => {
    const lidos = lerTemplatesPorCategoria([
      bind("oficina"),
      { categoria: "posto", name: "x" },
      null,
      "texto",
      { categoria: "", name: "x", language: "pt_BR", contract_hash: "h" },
    ]);
    expect(lidos).toHaveLength(1);
    expect(lidos[0]).toMatchObject({ categoria: "oficina", name: "modelo" });
  });

  it("mantém só valores string e corta o excesso", () => {
    const [lido] = lerTemplatesPorCategoria([
      { ...bind("oficina"), values: { "1": "Maria", "2": 42, "3": "x".repeat(5000) } },
    ]);
    expect(lido!.values).toEqual({ "1": "Maria", "3": "x".repeat(4000) });
  });

  it("duplicata de categoria: a PRIMEIRA vence", () => {
    const lidos = lerTemplatesPorCategoria([
      bind("oficina", "primeiro"),
      bind("OFICINA", "segundo"),
    ]);
    expect(lidos).toHaveLength(1);
    expect(lidos[0]!.name).toBe("primeiro");
  });

  it("jsonb que não é array vira lista vazia (campanha antiga)", () => {
    expect(lerTemplatesPorCategoria(null)).toEqual([]);
    expect(lerTemplatesPorCategoria({})).toEqual([]);
    expect(lerTemplatesPorCategoria("[]")).toEqual([]);
  });
});

describe("templateDaCategoria", () => {
  it("acha ignorando acento e caixa", () => {
    const binds = [bind("Óptica"), bind("oficina")];
    expect(templateDaCategoria(binds, "optica")?.categoria).toBe("Óptica");
    expect(templateDaCategoria(binds, "OFICINA")?.categoria).toBe("oficina");
    expect(templateDaCategoria(binds, "posto")).toBeNull();
  });

  it("chave vazia não casa com nada", () => {
    expect(chaveDaCategoria("  ")).toBe("");
    expect(templateDaCategoria([bind("oficina")], "   ")).toBeNull();
  });
});

describe("categoriasSemModelo", () => {
  it("lista só as categorias do recorte sem bind", () => {
    const binds = [bind("oficina"), bind("posto")];
    expect(categoriasSemModelo(binds, ["oficina", "posto", "restaurante"])).toEqual([
      "restaurante",
    ]);
  });

  it("recorte vazio e curinga histórico não exigem mapeamento", () => {
    expect(categoriasSemModelo([], [])).toEqual([]);
    expect(categoriasSemModelo([], ["empresas"])).toEqual([]);
  });

  it("curinga ao lado de categoria real não esconde a que falta", () => {
    expect(categoriasSemModelo([bind("oficina")], ["empresas", "restaurante"])).toEqual([
      "restaurante",
    ]);
  });
});

describe("resumoDosTemplatesPorCategoria", () => {
  it("mostra categoria, modelo e idioma, sem os valores", () => {
    expect(resumoDosTemplatesPorCategoria([bind("oficina", "boas_vindas")])).toEqual([
      { categoria: "oficina", name: "boas_vindas", language: "pt_BR" },
    ]);
  });
});
