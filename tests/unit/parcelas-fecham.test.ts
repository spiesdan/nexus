/**
 * E.6 — A SOMA DAS PARCELAS FECHA COM O TOTAL.
 *
 * `calcularParcelas` divide e joga o resto na última. O predicado é usado antes
 * de gravar o pedido: divergência de um centavo é recusada, não arredondada em
 * silêncio.
 */
import { describe, expect, it } from "vitest";

import { parcelasFecham } from "@/lib/comercial/parcelas";
import { dividirParcelas } from "@/lib/comercial/financeiro";
import { calcularParcelas } from "@/lib/schemas/pedidos";

describe("parcelas fecham com o total", () => {
  it.each([
    [1, "30/60"],
    [99, "30/60"],
    [1000, "30/60"],
    [12345, "30/60/90"],
    [100000, "0/30/60/90"],
    [999999, "28 dias"],
    [0, "30/60"],
  ])("total %i em %s: soma === total", (total, condicao) => {
    expect(parcelasFecham(calcularParcelas(total, condicao), total)).toBe(true);
  });

  it("o financeiro também fecha (resto na última)", () => {
    for (const total of [1, 1000, 12345, 999999]) {
      expect(parcelasFecham(dividirParcelas(total, "30/60/90", "2026-11-19"), total)).toBe(true);
    }
  });

  it("um centavo de divergência é recusado", () => {
    expect(parcelasFecham([{ valor_cents: 333 }, { valor_cents: 333 }, { valor_cents: 333 }], 1000)).toBe(false);
    expect(parcelasFecham([{ valor_cents: 500 }, { valor_cents: 500 }], 1000)).toBe(true);
  });

  it("sem rateio (à vista/prazo único) não é divergência", () => {
    expect(parcelasFecham([], 1)).toBe(true);
    expect(parcelasFecham([{ valor_cents: 10 }], 11)).toBe(true);
  });
});
