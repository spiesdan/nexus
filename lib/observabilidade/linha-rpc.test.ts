import { describe, expect, it } from "vitest";

import { linhaRpc, numeroRpc, p95Rpc, resumoSloRpc } from "./linha-rpc";

interface Resumo { total: number; erros: number; p95: number | string | null }

describe("leitura de RPC returns table", () => {
  const linha: Resumo = { total: 267, erros: 0, p95: 2660 };

  it("ARRAY de linhas (o que o PostgREST devolve hoje)", () => {
    const r = linhaRpc<Resumo>([linha]);
    expect(r).toEqual(linha);
    expect(numeroRpc(r?.total)).toBe(267);
    expect(numeroRpc(r?.erros)).toBe(0);
    expect(p95Rpc(r?.p95)).toBe(2660);
  });

  it("objeto único (se o provedor mudar)", () => {
    const r = linhaRpc<Resumo>(linha);
    expect(r).toEqual(linha);
    expect(numeroRpc(r?.total)).toBe(267);
    expect(p95Rpc(r?.p95)).toBe(2660);
  });

  it("sem linha: null, não objeto com campos undefined", () => {
    expect(linhaRpc<Resumo>([])).toBeNull();
    expect(linhaRpc<Resumo>(null)).toBeNull();
    expect(linhaRpc<Resumo>(undefined)).toBeNull();
  });

  it("p95 nulo continua nulo (não vira 0)", () => {
    expect(p95Rpc(null)).toBeNull();
    expect(p95Rpc("")).toBeNull();
    expect(numeroRpc(undefined)).toBe(0);
  });
});


describe("leitura do resumo do SLO pelos dois leitores", () => {
  const producao = [{ total: 267, erros: 0, p95: 2660 }];

  it("ARRAY de produção: total 267 e p95 2660 chegam ao painel e ao detector", () => {
    expect(resumoSloRpc(producao)).toEqual({ total: 267, erros: 0, p95: 2660 });
    // O detector só avalia com total >= 100 — antes era 0.
    expect(resumoSloRpc(producao).total).toBeGreaterThanOrEqual(100);
  });

  it("objeto único funciona da mesma forma", () => {
    expect(resumoSloRpc({ total: 267, erros: 0, p95: 2660 })).toEqual({
      total: 267,
      erros: 0,
      p95: 2660,
    });
  });

  it("sem linha: sem série (zeros e p95 nulo), não erro de leitura", () => {
    expect(resumoSloRpc([])).toEqual({ total: 0, erros: 0, p95: null });
    expect(resumoSloRpc(null)).toEqual({ total: 0, erros: 0, p95: null });
  });
});
