import { describe, expect, it } from "vitest";

import { totalDaNotaAoRetomar } from "./valor-da-nota";

/**
 * A nota agrupada vale a SOMA. O caso que motivou: a retomada usava só o
 * `invoices.order_id` e reemitia a nota de dois pedidos com o total de um.
 */
describe("total da nota ao retomar", () => {
  it("nota de um pedido: o total dele", () => {
    expect(
      totalDaNotaAoRetomar("pedido-1", ["pedido-1"], [{ id: "pedido-1", total_cents: 10_000 }]),
    ).toBe(10_000);
  });

  it("nota agrupada: soma dos vinculados, não o principal", () => {
    expect(
      totalDaNotaAoRetomar(
        "pedido-1",
        ["pedido-1", "pedido-2"],
        [
          { id: "pedido-1", total_cents: 6_000 },
          { id: "pedido-2", total_cents: 4_000 },
        ],
      ),
    ).toBe(10_000);
  });

  it("vinculado repetido não conta duas vezes", () => {
    expect(
      totalDaNotaAoRetomar(
        "pedido-1",
        ["pedido-1", "pedido-2", "pedido-2"],
        [
          { id: "pedido-1", total_cents: 6_000 },
          { id: "pedido-2", total_cents: 4_000 },
        ],
      ),
    ).toBe(10_000);
  });

  it("vinculado fora da leitura devolve null — não emite soma parcial", () => {
    expect(
      totalDaNotaAoRetomar(
        "pedido-1",
        ["pedido-1", "pedido-2"],
        [{ id: "pedido-1", total_cents: 6_000 }],
      ),
    ).toBeNull();
  });

  it("principal fora da leitura também devolve null", () => {
    expect(totalDaNotaAoRetomar("pedido-1", [], [])).toBeNull();
  });
});
