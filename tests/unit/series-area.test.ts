import { describe, expect, it } from "vitest";

import { toArea } from "@/lib/series";

/**
 * A área da série truncada tem que fechar no ÚLTIMO dado.
 *
 * No gráfico de vendas do mês corrente a linha realizada para em HOJE, mas o
 * polígono fechava na borda direita (`x0 + width`). O resultado era um platô
 * verde até o dia 31 — o desenho afirmava venda futura que o dado não tem.
 */
describe("toArea", () => {
  it("fecha no lastX quando a série não ocupa a largura inteira", () => {
    const area = toArea([0, 1], { width: 100, height: 50, lastX: 33 });

    expect(area.endsWith("33,50")).toBe(true);
    expect(area).not.toContain("100,50");
  });

  it("mantém a largura inteira por padrão", () => {
    const area = toArea([0, 1], { width: 100, height: 50 });

    expect(area.endsWith("100,50")).toBe(true);
  });

  it("não desenha nenhum ponto depois do lastX", () => {
    // A chamada do gráfico precisa passar `width` igual ao x do último dia
    // realizado. Se passar a largura cheia com a série truncada, `toPoints`
    // estica a linha até a borda e o polígono volta para o lastX — o trecho
    // triangular sob o futuro que a correção existe para evitar.
    const area = toArea([0, 0.5, 1], { width: 33, height: 50, lastX: 33 });
    const xs = area
      .split(" ")
      .map((p) => Number(p.split(",")[0]))
      .filter((x) => Number.isFinite(x));

    expect(Math.max(...xs)).toBe(33);
    expect(area.endsWith("33,50")).toBe(true);
  });
});
