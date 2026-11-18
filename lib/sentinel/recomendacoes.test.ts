import { describe, expect, it } from "vitest";

import { RECOMENDACOES } from "./recomendacoes";
import { REGRAS } from "./regras";
import type { Achado } from "./tipos";

const ACHADO: Achado = {
  regra: "x",
  categoria: "operacao",
  entidadeTipo: "x",
  entidadeId: "1",
  titulo: "t",
  resumo: "r",
  causaProvavel: "c",
  severidade: "media",
  href: null,
  evidencia: { total_notas: 2 },
};

describe("recomendações do Sentinel (Nível 1)", () => {
  it("toda regra tem plano, e nenhum plano é órfão", () => {
    const regras = REGRAS.map((r) => r.id).sort();
    const planos = Object.keys(RECOMENDACOES).sort();
    expect(planos).toEqual(regras);
  });

  it("todo plano é revisável: passos, risco, reversibilidade, fonte e confiança", () => {
    for (const regra of REGRAS) {
      const plano = RECOMENDACOES[regra.id]!({ ...ACHADO, regra: regra.id });
      expect(plano.resumo.length, regra.id).toBeGreaterThan(10);
      expect(plano.passos.length, regra.id).toBeGreaterThan(0);
      expect(plano.campos_pendentes.length, regra.id).toBeGreaterThan(0);
      expect(["baixo", "medio", "alto"], regra.id).toContain(plano.risco);
      expect(["reversivel", "parcial", "irreversivel"], regra.id).toContain(
        plano.reversibilidade,
      );
      expect(["alta", "media", "baixa"], regra.id).toContain(plano.confianca);
      expect(plano.fonte.length, regra.id).toBeGreaterThan(0);
      expect(typeof plano.exige_aprovacao, regra.id).toBe("boolean");
      expect(plano.limitacao === null || typeof plano.limitacao === "string").toBe(true);
    }
  });

  it("nenhum plano promete execução automática", () => {
    for (const [id, construir] of Object.entries(RECOMENDACOES)) {
      const plano = construir({ ...ACHADO, regra: id });
      const texto = [plano.resumo, ...plano.passos].join(" ").toLowerCase();
      expect(texto, id).not.toContain("automaticamente");
      expect(texto, id).not.toContain("o sentinel corrige");
    }
  });

  it("as duas regras com limitação estrutural declaram confiança baixa/média", () => {
    const estoque = RECOMENDACOES["operacao.estoque_divergente"]!({
      ...ACHADO,
      regra: "operacao.estoque_divergente",
    });
    expect(estoque.confianca).toBe("baixa");
    expect(estoque.limitacao).toContain("saldo de abertura");

    const lead = RECOMENDACOES["operacao.lead_duplicado"]!({
      ...ACHADO,
      regra: "operacao.lead_duplicado",
    });
    expect(lead.confianca).toBe("media");
    expect(lead.limitacao).toContain("contato");
  });
});
