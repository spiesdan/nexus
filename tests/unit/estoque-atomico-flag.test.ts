/**
 * A FLAG É O INTERRUPTOR: desligada (default), o fluxo antigo; ligada, a RPC.
 */
import { afterEach, describe, expect, it } from "vitest";

import { estoqueAtomicoHabilitado } from "@/lib/comercial/criar-pedido";

afterEach(() => {
  delete process.env.ORDER_STOCK_ATOMIC;
});

describe("estoqueAtomicoHabilitado", () => {
  it("default é DESLIGADO", () => {
    delete process.env.ORDER_STOCK_ATOMIC;
    expect(estoqueAtomicoHabilitado()).toBe(false);
  });

  it("só a string exata 'true' liga", () => {
    process.env.ORDER_STOCK_ATOMIC = "true";
    expect(estoqueAtomicoHabilitado()).toBe(true);
    process.env.ORDER_STOCK_ATOMIC = "1";
    expect(estoqueAtomicoHabilitado()).toBe(false);
  });
});
