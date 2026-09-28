import { describe, expect, it } from "vitest";

import { recomendar } from "@/lib/ai/sales-brain/recommend";
import type { HistoricoCompra } from "@/lib/comercial/radar-compras";

function base(over: Partial<HistoricoCompra>): HistoricoCompra {
  return {
    contact_id: "c1",
    vendas: [],
    primeira_compra: "2026-01-01",
    ultima_compra: "2026-08-01",
    qtd_pedidos: 3,
    faturamento_cents: 30000,
    ticket_medio_cents: 10000,
    ticket_mediano_cents: 10000,
    intervalo_medio_dias: 24,
    intervalo_mediano_dias: 24,
    maior_intervalo_dias: 30,
    menor_intervalo_dias: 20,
    canal_predominante: "balcao",
    dias_sem_compra: 31,
    atraso_dias: 7,
    situacao: "recompra_atrasada",
    pedido_aberto_id: null,
    pedido_aberto_total_cents: null,
    orcamento_total_cents: null,
    cancelado_total_cents: null,
    ultimos: [],
    ...over,
  };
}

describe("sales-brain recommend (NEXUS 2.0 §27 — dados reais, sem mock)", () => {
  it("recompra atrasada vira prioridade alta com motivo citando ciclo", () => {
    const r = recomendar(base({}));
    expect(r?.prioridade).toBe("alta");
    expect(r?.proxima_acao).toBe("whatsapp");
    expect(r?.motivo).toContain("31 dias");
    expect(r?.motivo).toContain("24 dias");
  });

  it("ok e novo_sem_compras não geram recomendação", () => {
    expect(recomendar(base({ situacao: "ok" }))).toBeNull();
    expect(recomendar(base({ situacao: "novo_sem_compras" }))).toBeNull();
  });

  it("pedido em voo manda ver o cliente, não ofertar", () => {
    const r = recomendar(base({ situacao: "em_voo" }));
    expect(r?.proxima_acao).toBe("ver_cliente");
    expect(r?.prioridade).toBe("media");
  });
});
