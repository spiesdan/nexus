import { describe, expect, it } from "vitest";

import { limitesDe, linhaDeRota, poligonoDePrecisao } from "@/lib/mapas/geometria";

describe("linhaDeRota", () => {
  it("converte [lng,lat] sem trocar os eixos", () => {
    // O erro clássico do módulo: 25.4 de longitude põe a entrega no oceano.
    const f = linhaDeRota([
      [-50.39, -26.17],
      [-50.4, -26.18],
    ]);
    expect(f?.geometry.coordinates).toEqual([
      [-50.39, -26.17],
      [-50.4, -26.18],
    ]);
    expect(f?.geometry.type).toBe("LineString");
  });

  it("descarta coordenada inválida em vez de deixar NaN derrubar a fonte", () => {
    // Um `NaN` no meio faz o MapLibre recusar a fonte INTEIRA: a rota
    // desaparece do mapa sem erro na tela.
    const f = linhaDeRota([
      [-50.39, -26.17],
      [Number.NaN, -26.18],
      [-50.4, Number.POSITIVE_INFINITY],
      [-50.41, -26.19],
      [-50.42, 91],
    ]);
    expect(f?.geometry.coordinates).toEqual([
      [-50.39, -26.17],
      [-50.41, -26.19],
    ]);
  });

  it("menos de dois pontos não é linha", () => {
    expect(linhaDeRota([])).toBeNull();
    expect(linhaDeRota([[-50.39, -26.17]])).toBeNull();
    expect(linhaDeRota(null)).toBeNull();
    expect(linhaDeRota([[Number.NaN, -26.17], [-50.4, -26.18]])).toBeNull();
  });
});

describe("poligonoDePrecisao", () => {
  const LAT = -26.17;
  const LNG = -50.39;

  it("fecha o anel — polígono aberto não pinta no MapLibre", () => {
    const f = poligonoDePrecisao(LAT, LNG, 60, 32);
    const anel = f?.geometry.coordinates[0];
    expect(anel).toHaveLength(33);
    expect(anel?.[0]).toEqual(anel?.[32]);
    expect(f?.geometry.type).toBe("Polygon");
  });

  it("o raio em metros é respeitado nos dois eixos", () => {
    const RAIO = 60;
    const anel = poligonoDePrecisao(LAT, LNG, RAIO, 64)?.geometry.coordinates[0] ?? [];
    // 1 grau de latitude ≈ 111.320 m; tolerância de 1% para a discretização.
    const grausLat = RAIO / 111_320;
    const grausLng = RAIO / (111_320 * Math.cos((LAT * Math.PI) / 180));
    const latitudes = anel.map(([, lat]) => lat);
    const longitudes = anel.map(([lng]) => lng);
    expect(Math.max(...latitudes) - LAT).toBeCloseTo(grausLat, 6);
    expect(LNG - Math.min(...longitudes)).toBeCloseTo(grausLng, 6);
    // Sem o cosseno da latitude o círculo sairia ~11% mais largo aqui.
    expect(grausLng).toBeGreaterThan(grausLat * 1.1);
  });

  it("no polo não gera NaN — longitude encolhe, mas o anel existe", () => {
    const f = poligonoDePrecisao(90, 0, 50, 16);
    const anel = f?.geometry.coordinates[0] ?? [];
    expect(anel).toHaveLength(17);
    for (const [lng, lat] of anel) {
      expect(Number.isFinite(lng)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
    }
  });

  it("entrada degenerada devolve null em vez de polígono inválido", () => {
    expect(poligonoDePrecisao(LAT, LNG, 0)).toBeNull();
    expect(poligonoDePrecisao(LAT, LNG, -10)).toBeNull();
    expect(poligonoDePrecisao(LAT, LNG, Number.NaN)).toBeNull();
  });
});

describe("limitesDe", () => {
  it("devolve a caixa em [lng,lat]", () => {
    expect(
      limitesDe([
        [-50.5, -26.3],
        [-50.1, -26.0],
        [-50.3, -26.2],
      ]),
    ).toEqual([
      [-50.5, -26.3],
      [-50.1, -26.0],
    ]);
  });

  it("ignora ponto inválido e devolve null quando não sobra nada", () => {
    expect(limitesDe([[Number.NaN, -26.3]])).toBeNull();
    expect(limitesDe([])).toBeNull();
  });

  it("ponto único devolve caixa degenerada — quem chamou decide o zoom", () => {
    expect(limitesDe([[-50.3, -26.2]])).toEqual([
      [-50.3, -26.2],
      [-50.3, -26.2],
    ]);
  });
});
