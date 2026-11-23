import { describe, expect, it } from "vitest";

import { avaliarCobertura, avaliarResultado } from "../../scripts/mercos-cobertura.mjs";

describe("cobertura da reconciliação — zero sem olhar não é zero", () => {
  it("censo inteiro e sem ilegíveis é completa", () => {
    expect(avaliarCobertura({ censoEsperado: 5929, censoLido: 5929 })).toEqual({
      status: "completa",
      motivos: [],
    });
  });

  it("censo parcial é incompleta e diz quanto faltou olhar", () => {
    const r = avaliarCobertura({ censoEsperado: 5929, censoLido: 394 });
    expect(r.status).toBe("incompleta");
    expect(r.motivos.join(" ")).toContain("394 de 5929");
  });

  it("sem meta do censo é incompleta", () => {
    expect(avaliarCobertura({ censoLido: 5929 }).status).toBe("incompleta");
  });

  it("uma linha ilegível já derruba a rodada", () => {
    const r = avaliarCobertura({ censoEsperado: 10, censoLido: 9, linhasIlegiveis: 1 });
    expect(r.status).toBe("incompleta");
    expect(r.motivos.join(" ")).toContain("ilegível");
  });

  it("registro sem data também derruba (fora da janela verificável)", () => {
    expect(avaliarCobertura({ censoEsperado: 10, censoLido: 10, registrosSemData: 1 }).status)
      .toBe("incompleta");
  });

  it("erro de leitura/escrita derruba", () => {
    expect(avaliarCobertura({ censoEsperado: 10, censoLido: 10, erros: 1 }).status)
      .toBe("incompleta");
  });
});

describe("regra de ouro: completa E zero ausentes", () => {
  const completa = avaliarCobertura({ censoEsperado: 5929, censoLido: 5929 });

  it("autoriza 'nenhum pedido de fora' só com completa e zero", () => {
    const r = avaliarResultado({ cobertura: completa, ausentesDepois: 0 });
    expect(r.verificado).toBe(true);
    expect(r.declaracao).toBe("nenhum pedido de fora");
  });

  it("completa mas com ausentes não autoriza", () => {
    const r = avaliarResultado({ cobertura: completa, ausentesDepois: 4 });
    expect(r.verificado).toBe(false);
    expect(r.declaracao).toContain("4 ausente(s)");
  });

  it("incompleta com zero ausentes ainda não autoriza — e diz o motivo", () => {
    const r = avaliarResultado({
      cobertura: avaliarCobertura({ censoEsperado: 5929, censoLido: 394 }),
      ausentesDepois: 0,
    });
    expect(r.verificado).toBe(false);
    expect(r.declaracao).toContain("não verificado");
    expect(r.declaracao).toContain("394 de 5929");
  });
});
