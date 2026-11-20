import { describe, expect, it } from "vitest";

import { COLETAS, FONTES_DA_REGRA, regrasBloqueadas } from "./fontes";
import { REGRAS } from "./regras";

describe("fontes das regras", () => {
  it("toda regra do registry tem fontes declaradas", () => {
    const faltando = REGRAS.map((r) => r.id).filter((id) => !(id in FONTES_DA_REGRA));
    expect(faltando).toEqual([]);
  });

  it("toda fonte é uma coleta conhecida", () => {
    const conhecidas = new Set<string>(COLETAS);
    const desconhecidas = Object.values(FONTES_DA_REGRA)
      .flat()
      .filter((f) => !conhecidas.has(f));
    expect([...new Set(desconhecidas)]).toEqual([]);
  });

  it("mercos truncado não bloqueia fiscal nem lead duplicado", () => {
    const bloqueadas = regrasBloqueadas(["importacoes_mercos"]);
    expect(bloqueadas.has("fiscal.nota_rejeitada")).toBe(false);
    expect(bloqueadas.has("operacao.lead_duplicado")).toBe(false);
    expect(bloqueadas.has("operacao.mercos_importacao_falhou")).toBe(true);
  });
});
