import { describe, expect, it } from "vitest";

import { valoresDoParametro } from "@/lib/prospeccao/parametros";

describe("valoresDoParametro — o parâmetro que se repete na URL", () => {
  it("ausente → lista vazia (filtro desligado, não erro)", () => {
    expect(valoresDoParametro(undefined)).toEqual([]);
    expect(valoresDoParametro(null)).toEqual([]);
    expect(valoresDoParametro("")).toEqual([]);
  });

  it("uma vez → uma posição (o deep-link antigo continua valendo)", () => {
    expect(valoresDoParametro("Auto repair shop")).toEqual(["Auto repair shop"]);
  });

  it("MAIS DE UMA vez → todas, na ordem em que chegaram", () => {
    // A segunda categoria é o caso novo: era aqui que um `.trim()` direto no
    // valor estourava com `TypeError` e derrubava a tela inteira.
    expect(valoresDoParametro(["Gas station", "Auto repair shop"])).toEqual([
      "Gas station",
      "Auto repair shop",
    ]);
  });

  it("espaço e vazio não viram filtro (URL colada à mão)", () => {
    // `?categoria=&categoria=%20` não pode virar dois filtros vazios: eles
    // iriam para o `in` e a lista viria vazia, com o filtro parecendo ligado.
    expect(valoresDoParametro(["  Auto repair shop  ", "", "   "])).toEqual([
      "Auto repair shop",
    ]);
  });
});
