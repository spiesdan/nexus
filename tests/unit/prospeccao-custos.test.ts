import { describe, expect, it } from "vitest";

import { CUSTOS_PADRAO, custoDe, custoEfetivo } from "@/lib/prospeccao/custos";

describe("custoDe (preços por provider, neutros)", () => {
  it("google_places cobra busca e detalhe nos defaults", () => {
    expect(custoDe("google_places")).toEqual({ busca: 18, detalhe: 11 });
  });

  it("osm_overpass é grátis (conta só requisições/ritmo)", () => {
    expect(custoDe("osm_overpass")).toEqual({ busca: 0, detalhe: 0 });
  });

  it("provider desconhecido nunca cobra — não se cobra o que não se sabe precificar", () => {
    expect(custoDe("qualquer_coisa")).toEqual({ busca: 0, detalhe: 0 });
  });

  it("todo provider do registro tem preço declarado", () => {
    for (const nome of ["google_places", "osm_overpass", "maps_browser", "maps_arquivo"]) {
      expect(CUSTOS_PADRAO[nome]).toBeDefined();
    }
  });
});

describe("custoEfetivo (settings por cima do neutro, D4)", () => {
  const semConfig = { preco_busca_cents: null, preco_detalhe_cents: null };

  it("sem linha de settings vale o default do arquivo", () => {
    expect(custoEfetivo("google_places", null)).toEqual({ busca: 18, detalhe: 11 });
    expect(custoEfetivo("google_places", undefined)).toEqual({ busca: 18, detalhe: 11 });
    expect(custoEfetivo("google_places", semConfig)).toEqual({ busca: 18, detalhe: 11 });
  });

  it("preço gravado no tenant sobrepõe o default (tabela do Google mudou)", () => {
    expect(custoEfetivo("google_places", { preco_busca_cents: 25, preco_detalhe_cents: 20 })).toEqual({
      busca: 25,
      detalhe: 20,
    });
  });

  it("override parcial: o campo nulo cai no default, campo a campo", () => {
    expect(custoEfetivo("google_places", { preco_busca_cents: 25, preco_detalhe_cents: null })).toEqual({
      busca: 25,
      detalhe: 11,
    });
  });

  it("OSM/mapas nunca herdam preço do Google — provider grátis continua zero", () => {
    expect(custoEfetivo("osm_overpass", { preco_busca_cents: 25, preco_detalhe_cents: 20 })).toEqual({
      busca: 0,
      detalhe: 0,
    });
    expect(custoEfetivo("maps_browser", { preco_busca_cents: 25, preco_detalhe_cents: 20 })).toEqual({
      busca: 0,
      detalhe: 0,
    });
  });

  it("provider desconhecido segue grátis mesmo com preço gravado", () => {
    expect(custoEfetivo("qualquer_coisa", { preco_busca_cents: 25, preco_detalhe_cents: 20 })).toEqual({
      busca: 0,
      detalhe: 0,
    });
  });
});
