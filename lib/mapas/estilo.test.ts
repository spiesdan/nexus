import { describe, expect, it } from "vitest";

import { ATRIBUICAO_OSM, TILES_OSM, ZOOM_MAXIMO, estiloOsm } from "@/lib/mapas/estilo";

describe("o estilo do mapa", () => {
  it("usa o domínio único do OSM — `{s}` volta a custar três handshakes no celular", () => {
    // Medido no Pixel 7 em 04/11/2026: `a.` e `b.` voltavam ERR_ABORTED no
    // primeiro desenho e a cabine abria com o mapa pela metade.
    expect(TILES_OSM).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(TILES_OSM).not.toContain("{s}");
  });

  it("declara tile de 256px — o default do MapLibre é 512", () => {
    // Com 512 declarado para imagem de 256, o mapa acha que cada tile cobre o
    // dobro do terreno e repete o mundo em miniatura.
    const estilo = estiloOsm();
    const fonte = estilo.sources.osm as { tileSize: number; type: string };
    expect(fonte.type).toBe("raster");
    expect(fonte.tileSize).toBe(256);
  });

  it("carrega a atribuição que a licença ODbL exige", () => {
    const estilo = estiloOsm();
    const fonte = estilo.sources.osm as { attribution: string };
    expect(fonte.attribution).toBe(ATRIBUICAO_OSM);
    expect(fonte.attribution).toContain("openstreetmap.org/copyright");
    expect(estilo.layers.map((l) => l.id)).toContain("osm");
  });

  it("não embute chave de provedor pago", () => {
    const texto = JSON.stringify(estiloOsm());
    for (const proibido of ["access_token", "api_key", "apikey", "mapbox.com", "maptiler"]) {
      expect(texto.toLowerCase()).not.toContain(proibido);
    }
    expect(ZOOM_MAXIMO).toBe(19);
  });
});
