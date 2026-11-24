import { describe, expect, it } from "vitest";

import { linksDeNavegacao } from "./navegacao-externa";

const fim = {
  latitude: -26.1213,
  longitude: -50.3897,
  endereco: "FAZ BATATAIS, S/N — BELA VISTA DO SUL, MAFRA/SC, 89300001",
};

describe("links oficiais de navegação", () => {
  it("com coordenada devolve Google Maps e Waze, sem chave de API", () => {
    const links = linksDeNavegacao(fim)!;
    expect(links.google).toContain("https://www.google.com/maps/dir/?api=1&destination=");
    expect(links.waze).toBe("https://waze.com/ul?ll=-26.1213%2C-50.3897&navigate=yes");
    expect(links.google).not.toMatch(/key=/i);
    expect(links.destino).toBe("endereco");
  });

  it("endereço incompleto não substitui a coordenada", () => {
    const links = linksDeNavegacao({ ...fim, endereco: "casa" })!;
    expect(links.destino).toBe("coordenada");
    expect(links.google).toContain("-26.1213%2C-50.3897");
  });

  it("sem coordenada, nenhum link — não se inventa endereço", () => {
    expect(linksDeNavegacao({ endereco: fim.endereco })).toBeNull();
    expect(linksDeNavegacao({ latitude: null, longitude: -50 })).toBeNull();
  });
});
