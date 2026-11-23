import { describe, expect, it } from "vitest";

import { patchDeGeocodificacao } from "./geocodificacao-patch";

const AGORA = "2026-11-23T12:00:00.000Z";

describe("regeocodificação não destrutiva", () => {
  it("sucesso grava a nova coordenada", () => {
    const patch = patchDeGeocodificacao(
      { estado: "ok", latitude: -26.1, longitude: -52.6, precisao: "numero" } as never,
      AGORA,
    );
    expect(patch).toMatchObject({
      latitude: -26.1,
      longitude: -52.6,
      geo_status: "ok",
      geo_fonte: "nominatim:numero",
      geo_em: AGORA,
    });
  });

  it("erro do provedor NÃO apaga coordenada válida", () => {
    const patch = patchDeGeocodificacao(
      { estado: "erro", latitude: null, longitude: null } as never,
      AGORA,
    );
    expect(patch).toEqual({
      geo_status: "erro",
      geo_em: AGORA,
      geo_fonte: "nominatim",
    });
    // A ausência das chaves é o contrato: o UPDATE não toca lat/lng.
    expect(Object.hasOwn(patch, "latitude")).toBe(false);
    expect(Object.hasOwn(patch, "longitude")).toBe(false);
  });

  it("outros estados de falha também preservam o pino", () => {
    for (const estado of ["nao_encontrado", "ambiguo"]) {
      const patch = patchDeGeocodificacao({ estado, latitude: null, longitude: null } as never, AGORA);
      expect(patch.geo_status).toBe(estado);
      expect(Object.hasOwn(patch, "latitude")).toBe(false);
    }
  });
});
