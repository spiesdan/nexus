import { describe, expect, it } from "vitest";

import { podeSairParaRota, qtdNaoSeparados } from "@/lib/entregas/separacao";

describe("separação (trava da saída para rota)", () => {
  it("conta os não separados", () => {
    expect(qtdNaoSeparados([{ separado_em: null }, { separado_em: "2026-09-25T10:00:00Z" }])).toBe(1);
    expect(qtdNaoSeparados([])).toBe(0);
  });

  it("só sai com tudo separado e carga não vazia", () => {
    expect(podeSairParaRota([{ separado_em: "2026-09-25T10:00:00Z" }])).toBe(true);
    expect(podeSairParaRota([{ separado_em: null }])).toBe(false);
    expect(podeSairParaRota([])).toBe(false);
  });
});
