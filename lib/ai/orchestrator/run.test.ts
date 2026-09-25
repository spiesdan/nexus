import { describe, expect, it } from "vitest";

import { proporAcoes } from "@/lib/ai/orchestrator/run";
import type { BrainRecomendacao } from "@/lib/ai/sales-brain/recommend";

function rec(over: Partial<BrainRecomendacao> = {}): BrainRecomendacao {
  return {
    contact_id: "c1",
    prioridade: "alta",
    motivo: "m",
    recomendacao: "r",
    proxima_acao: "whatsapp",
    situacao: "recompra_atrasada",
    dias_sem_compra: 31,
    atraso_dias: 7,
    intervalo_mediano_dias: 24,
    ultima_compra: "2026-08-01",
    ticket_medio_cents: 10000,
    ...over,
  };
}

describe("orchestrator run (propor, nunca executar)", () => {
  it("gera uma decisão proposta por recomendação", () => {
    const ds = proporAcoes([rec(), rec({ contact_id: "c2", situacao: "em_risco" })], 1);
    expect(ds).toHaveLength(2);
    expect(ds[0]?.contact_id).toBe("c1");
    expect(ds[0]?.governanca.quem_decidiu).toBe("sales-orchestrator");
    expect(ds[1]?.evento).toBe("cliente_em_risco");
  });

  it("sinais assumidos entram na trilha de governança", () => {
    const ds = proporAcoes([rec()], 1);
    expect(ds[0]?.governanca.dados_utilizados).toContain("sinais_nao_verificados");
    const verificados = proporAcoes([rec()], 1, {
      tem_saldo_estoque: true,
      financeiramente_apto: true,
      verificados: true,
    });
    expect(verificados[0]?.governanca.dados_utilizados).not.toContain("sinais_nao_verificados");
  });

  it("nível 1 sempre exige aprovação para ação externa", () => {
    const ds = proporAcoes([rec()], 1);
    expect(ds[0]?.requer_aprovacao).toBe(true);
  });
});
