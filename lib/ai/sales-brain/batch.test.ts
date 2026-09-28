import { describe, expect, it } from "vitest";

import { brainDoLote } from "@/lib/ai/sales-brain/batch";
import type { PedidoParaRadar } from "@/lib/comercial/radar-compras";

function pedido(contact: string, dia: string, status = "faturado"): PedidoParaRadar {
  return { id: `${contact}-${dia}`, contact_id: contact, total_cents: 10000, status, origem: "balcao", dia };
}

describe("sales-brain batch (lote sobre pedidos reais)", () => {
  it("sem pedidos, sem recomendações (nada inventado)", () => {
    expect(brainDoLote([], "2026-09-24")).toEqual([]);
  });

  it("ordena alta antes de baixa e ignora quem está em dia", () => {
    const pedidos: PedidoParaRadar[] = [
      // c1: ciclo ~20d, última há 60d → recompra atrasada (alta)
      pedido("c1", "2026-06-01"),
      pedido("c1", "2026-06-21"),
      pedido("c1", "2026-07-11"),
      // c2: uma compra só → primeira_compra (baixa)
      pedido("c2", "2026-09-01"),
      // c3: ciclo ~15d, última há 10d → ok (fora)
      pedido("c3", "2026-08-25"),
      pedido("c3", "2026-09-09"),
      pedido("c3", "2026-09-14"),
    ];
    const recs = brainDoLote(pedidos, "2026-09-24");
    expect(recs.map((r) => r?.contact_id)).toEqual(["c1", "c2"]);
    expect(recs[0]?.prioridade).toBe("alta");
  });

  it("pedidos sem contato são descartados", () => {
    const semContato: PedidoParaRadar = {
      id: "x",
      contact_id: null,
      total_cents: 5000,
      status: "aprovado",
      origem: "balcao",
      dia: "2026-01-01",
    };
    expect(brainDoLote([semContato], "2026-09-24")).toEqual([]);
  });
});
