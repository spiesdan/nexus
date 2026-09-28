import { describe, expect, it } from "vitest";

import { mediaDiaria, ordenarSugestoes, sugerirPara } from "@/lib/estoque/sugestao";

describe("sugestão de compra (cobertura real)", () => {
  it("saldo baixo com giro sugere recompor até 14 dias", () => {
    const s = sugerirPara({
      product_id: "p1",
      quantidade: 10,
      saidas_janela: 30,
      dias_janela: 30,
      controla_estoque: true,
      custo_unit_cents: 500,
    });
    expect(s?.media_diaria).toBe(1);
    expect(s?.cobertura_dias).toBe(10);
    expect(s?.qtd_sugerida).toBe(4);
    expect(s?.valor_sugerido_cents).toBe(2000);
    expect(s?.metodo).toBe("cobertura");
  });

  it("sem giro medido não sugere (não inventa demanda)", () => {
    expect(
      sugerirPara({ product_id: "p", quantidade: 0, saidas_janela: 0, dias_janela: 30, controla_estoque: true, custo_unit_cents: null }),
    ).toBeNull();
  });

  it("quem não controla estoque e quem está coberto ficam de fora", () => {
    expect(
      sugerirPara({ product_id: "p", quantidade: 5, saidas_janela: 30, dias_janela: 30, controla_estoque: false, custo_unit_cents: null }),
    ).toBeNull();
    expect(
      sugerirPara({ product_id: "p", quantidade: 100, saidas_janela: 30, dias_janela: 30, controla_estoque: true, custo_unit_cents: null }),
    ).toBeNull();
  });

  it("mediaDiaria nunca negativa nem NaN", () => {
    expect(mediaDiaria(-5, 30)).toBe(0);
    expect(mediaDiaria(10, 0)).toBe(0);
  });

  it("ordena o mais urgente primeiro", () => {
    const ss = ordenarSugestoes([
      { product_id: "b", media_diaria: 1, cobertura_dias: 10, qtd_sugerida: 4, valor_sugerido_cents: null, metodo: "cobertura" },
      { product_id: "a", media_diaria: 2, cobertura_dias: 2, qtd_sugerida: 26, valor_sugerido_cents: null, metodo: "cobertura" },
    ]);
    expect(ss.map((s) => s.product_id)).toEqual(["a", "b"]);
  });
});
