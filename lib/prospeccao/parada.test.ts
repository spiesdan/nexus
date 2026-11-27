import { describe, expect, it } from "vitest";

import { estadoDeParada, PARADA_MAXIMA_S } from "./parada";

describe("parada declarada da busca", () => {
  it("prazo máximo é 120 s do termo + folga de escrita", () => {
    expect(PARADA_MAXIMA_S).toBe(125);
  });

  it("running com pedido de pause aparece como 'parando'", () => {
    expect(estadoDeParada("running", "2026-11-27T10:00:00Z")).toBe("parando");
  });

  it("depois do termo, paused aparece como 'parado'", () => {
    expect(estadoDeParada("paused", "2026-11-27T10:00:00Z")).toBe("parado");
  });

  it("sem pedido de pause não inventa estado", () => {
    expect(estadoDeParada("running", null)).toBeNull();
    expect(estadoDeParada("completed", "2026-11-27T10:00:00Z")).toBeNull();
  });
});
