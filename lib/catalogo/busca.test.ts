/**
 * Vocabulário do balcão: apelido vira nome de catálogo na tokenização, então
 * o produto certo pontua em primeiro e o "quis dizer" fantasma nem nasce.
 * Decretado pelo dono em 2026-10-15 ("solupa sempre é solubill, intercap
 * sempre é billcap").
 */
import { describe, expect, it } from "vitest";

import {
  buscarComRelaxamento,
  pontuar,
  tokenizar,
  type ProdutoBuscavel,
} from "@/lib/catalogo/busca";

const SOLUBILL: ProdutoBuscavel[] = [
  { nome: "SOLUBILL 2L", codigo: "385" },
  { nome: "SOLUBILL 5L", codigo: "386" },
  { nome: "SOLUBILL 20L", codigo: "384" },
  { nome: "SOL DA GIRANDO LIMPEZA 500ML", codigo: "900" },
];

describe("sinonimos de balcao", () => {
  it("solupa tokeniza como solubill", () => {
    expect(tokenizar("solupa")).toEqual({ palavras: ["solubill"], numeros: [] });
  });

  it("intercap tokeniza como billcap", () => {
    expect(tokenizar("intercap")).toEqual({ palavras: ["billcap"], numeros: [] });
  });

  it("solupa pontua SOLUBILL acima de girando sol", () => {
    const tokens = tokenizar("solupa");
    const notas = SOLUBILL.map((p) => ({ nome: p.nome, nota: pontuar(p, tokens) }));
    const top = [...notas].sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1))[0];
    expect(top?.nome).toMatch(/SOLUBILL/);
    expect(top?.nota).not.toBeNull();
  });

  it("busca completa por solupa traz solubill em primeiro", () => {
    const r = buscarComRelaxamento(SOLUBILL, "tem solupa?");
    expect(r.achados.length).toBeGreaterThan(0);
    expect(r.achados[0]?.produto.nome).toMatch(/SOLUBILL/);
  });
});
