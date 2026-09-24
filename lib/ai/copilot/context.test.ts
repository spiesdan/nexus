import { describe, expect, it } from "vitest";

import { contagemVazia, perguntasPara, resumirCliente, resumirPolitica, resumirRadar } from "@/lib/ai/copilot/context";

describe("copilot context (puro, dados reais)", () => {
  it("perguntas estáveis por página", () => {
    expect(perguntasPara("cliente")).toContain("risco_do_cliente");
    expect(perguntasPara("radar")).toContain("quem_agir_primeiro");
    expect(perguntasPara("pedido")).toContain("desconto_dentro_da_politica");
  });

  it("resumo do cliente cita ciclo e atraso", () => {
    const r = resumirCliente({
      contact_id: "c1",
      vendas: [],
      primeira_compra: "2026-01-01",
      ultima_compra: "2026-08-01",
      qtd_pedidos: 4,
      faturamento_cents: 40000,
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
    });
    expect(r).toContain("24 dias");
    expect(r).toContain("31 dias");
    expect(r).toContain("recompra_atrasada");
  });

  it("resumo do radar soma quem pede ação e declara amostra", () => {
    const c = contagemVazia();
    c.em_risco = 2;
    c.recompra_atrasada = 3;
    c.ok = 10;
    const r = resumirRadar(c, 15, true);
    expect(r).toContain("5 de 15");
    expect(r).toContain("amostra parcial");
  });

  it("resumo da política cita desconto e estoque", () => {
    const r = resumirPolitica({
      desconto_max_vendedor_pct: 10,
      permite_estoque_negativo: false,
      comissao_padrao_pct: null,
    });
    expect(r).toContain("10%");
    expect(r).toContain("bloqueado");
  });
});
