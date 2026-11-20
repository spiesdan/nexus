/**
 * RÉGUA DA MATRIZ FISCAL — testada sem navegador, como a de público/auth.
 *
 * O que já aconteceu uma vez não pode voltar: linha marcada como medida com a
 * tela errada. Aqui toda rota declara o h1 que prova a tela, e o redirect
 * declara o destino que a medição deve encontrar.
 */
import { describe, expect, it } from "vitest";

import { ROTAS_FISCAIS } from "../lib/rotas-fiscais";

describe("régua da captura fiscal", () => {
  it("toda rota declara h1 e o regex não casa vazio", () => {
    for (const rota of ROTAS_FISCAIS) {
      expect(rota.h1, `${rota.slug} sem h1`).toBeInstanceOf(RegExp);
      expect(rota.h1.test(""), `${rota.slug} casa vazio`).toBe(false);
    }
  });

  it("exatamente um entre destino e semRedirect", () => {
    for (const rota of ROTAS_FISCAIS) {
      const destino = "destino" in rota && Boolean(rota.destino);
      const semRedirect = "semRedirect" in rota && Boolean(rota.semRedirect);
      expect(Number(destino) + Number(semRedirect), rota.slug).toBe(1);
    }
  });

  it("slug e path únicos, path absoluto", () => {
    expect(new Set(ROTAS_FISCAIS.map((r) => r.slug)).size).toBe(ROTAS_FISCAIS.length);
    expect(new Set(ROTAS_FISCAIS.map((r) => r.path)).size).toBe(ROTAS_FISCAIS.length);
    for (const r of ROTAS_FISCAIS) expect(r.path.startsWith("/app/")).toBe(true);
  });

  it("títulos do NexusPageHeader são os h1 esperados", () => {
    const por = new Map(ROTAS_FISCAIS.map((r) => [r.slug, r]));
    expect(por.get("fiscal")?.h1.test("NF-e recebidas")).toBe(true);
    expect(por.get("fiscal-notas")?.h1.test("Todas as notas")).toBe(true);
    expect(por.get("fiscal-configuracoes")?.h1.test("Configurações fiscais")).toBe(true);
    expect(por.get("financeiro")?.h1.test("Financeiro")).toBe(true);
  });

  it("Títulos é redirect e a medição é do Financeiro", () => {
    const t = ROTAS_FISCAIS.find((r) => r.slug === "titulos");
    expect(t).toBeDefined();
    expect("destino" in t! && t!.destino).toBe("/app/financeiro");
    expect(t!.h1.test("Financeiro")).toBe(true);
  });

  it("o detalhe da nota NÃO está na régua (exige nota real)", () => {
    expect(ROTAS_FISCAIS.some((r) => r.path.includes("[id]"))).toBe(false);
  });
});
