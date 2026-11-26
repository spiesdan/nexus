import { describe, expect, it } from "vitest";

import { paradasSemCoordenada } from "./paradas-sem-coordenada";

describe("paradas sem coordenada (P0-2)", () => {
  it("conta pino ausente dos dois lados, inclusive zero", () => {
    const paradas = [
      { chave: "a", latitude: -26.2, longitude: -50.4 },
      { chave: "b", latitude: null, longitude: -50.4 },
      { chave: "c", latitude: -26.2, longitude: null },
      { chave: "d", latitude: 0, longitude: 0 },
      { chave: "e", latitude: null, longitude: null },
    ];
    expect(paradasSemCoordenada(paradas).map((p) => p.chave)).toEqual(["b", "c", "e"]);
  });

  it("todas com pino devolve lista vazia — a tela não dispara nada", () => {
    expect(
      paradasSemCoordenada([
        { latitude: 1, longitude: 2 },
        { latitude: 3, longitude: 4 },
      ]),
    ).toEqual([]);
  });

  it("lista vazia também é 'nada pendente'", () => {
    expect(paradasSemCoordenada([])).toEqual([]);
  });
});
