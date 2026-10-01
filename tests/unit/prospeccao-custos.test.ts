import { describe, expect, it } from "vitest";

import { CUSTOS_PADRAO, custoDe } from "@/lib/prospeccao/custos";

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
