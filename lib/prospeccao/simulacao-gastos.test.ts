/**
 * A SIMULAÇÃO TEM QUE DIZER QUANDO NÃO SABE.
 *
 * Cinco casos medidos: zero prospects, mil prospects, orçamento apertado,
 * estourado e CPM/CTR ausentes. O que se trava aqui é a honestidade do número:
 * faixa em centavos, aviso em 80%, bloqueio em 100% com liberação de gerente
 * por motivo, e zeros declarados quando a premissa de mídia não existe.
 */
import { describe, expect, it } from "vitest";

import {
  celulasDaGrade,
  custoDaCampanha,
  faixaProspeccao,
  guardOrcamento,
  simulacaoMidia,
} from "./simulacao-gastos";

const GOOGLE = custoDaCampanha("google_places");

describe("faixa de custo de prospecção", () => {
  it("zero prospects não inventa custo", () => {
    expect(faixaProspeccao({ celulas: 0, custo: GOOGLE })).toEqual({
      minimo: 0,
      esperado: 0,
      maximo: 0,
    });
  });

  it("mil células usam busca + detalhe × taxa, em centavos inteiros", () => {
    expect(GOOGLE).toEqual({ busca: 18, detalhe: 11 });
    expect(faixaProspeccao({ celulas: 1000, custo: GOOGLE })).toEqual({
      minimo: 20200,
      esperado: 23500,
      maximo: 29000,
    });
  });

  it("o preço configurado pelo tenant vence o default (regra reaproveitada)", () => {
    const cfg = custoDaCampanha("google_places", {
      preco_busca_cents: 20,
      preco_detalhe_cents: 10,
    });
    expect(cfg).toEqual({ busca: 20, detalhe: 10 });
    expect(faixaProspeccao({ celulas: 1000, custo: cfg }).esperado).toBe(25000);
  });

  it("a grade é a mesma da execução: centro, raio e overlap determinam as células", () => {
    const params = {
      latitude: -26.3,
      longitude: -48.8,
      raioKm: 10,
      tamanhoKm: 2,
      overlapPct: 20,
    };
    expect(celulasDaGrade(params)).toBeGreaterThan(0);
    expect(celulasDaGrade(params)).toBe(celulasDaGrade(params));
  });
});

describe("guard de orçamento", () => {
  it("orçamento apertado (80%) avisa mas não bloqueia", () => {
    const guarda = guardOrcamento({ gastoCents: 8500, limiteCents: 10000 });
    expect(guarda.estado).toBe("aviso");
    expect(guarda.permite).toBe(true);
    expect(guarda.proximoPasso).toContain("80%");
  });

  it("orçamento estourado bloqueia; gerente libera só com motivo", () => {
    const semMotivo = guardOrcamento({ gastoCents: 10000, limiteCents: 10000 });
    expect(semMotivo.estado).toBe("bloqueio");
    expect(semMotivo.permite).toBe(false);
    expect(semMotivo.proximoPasso).toContain("liberação de gerente");

    const liberada = guardOrcamento({
      gastoCents: 10000,
      limiteCents: 10000,
      liberacao: { papel: "manager", motivo: "campanha aprovada pelo dono" },
    });
    expect(liberada.permite).toBe(true);
    expect(liberada.liberado).toBe(true);
    expect(liberada.proximoPasso).toContain("auditoria");

    const motivoVazio = guardOrcamento({
      gastoCents: 10000,
      limiteCents: 10000,
      liberacao: { papel: "manager", motivo: "   " },
    });
    expect(motivoVazio.permite).toBe(false);
  });
});

describe("simulação de mídia", () => {
  it("CPM e CTR ausentes dão zero com premissa nomeada — não chute", () => {
    const simulacao = simulacaoMidia({ verbaCents: 25000 });
    expect(simulacao.impressoes).toBe(0);
    expect(simulacao.cliques).toBe(0);
    expect(simulacao.premissas.join(" ")).toContain("CPM não informado");
    expect(simulacao.premissas.join(" ")).toContain("CTR não informado");
  });

  it("com premissas: impressões ≈ verba ÷ CPM × 1000 e cliques × CTR", () => {
    const simulacao = simulacaoMidia({ verbaCents: 25000, cpm: 25, ctr: 0.01 });
    expect(simulacao.impressoes).toBe(10000);
    expect(simulacao.cliques).toBe(100);
    expect(simulacao.premissas.join(" ")).toContain("premissa");
  });
});
