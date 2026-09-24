import { describe, expect, it } from "vitest";

import { decidir } from "@/lib/ai/orchestrator/decide";

describe("sales orchestrator decide (NEXUS 2.0 §36)", () => {
  it("nível 1 propõe com aprovação quando há estoque + aptidão", () => {
    const d = decidir(
      "recompra_prevista",
      {
        contact_id: "c1",
        dias_sem_compra: 31,
        atraso_dias: 7,
        prioridade: "alta",
        tem_saldo_estoque: true,
        financeiramente_apto: true,
      },
      1,
    );
    expect(d.ferramenta).toBe("gerar_abordagem");
    expect(d.requer_aprovacao).toBe(true);
    expect(d.governanca.quem_decidiu).toBe("sales-orchestrator");
  });

  it("nível 4 executa ação autorizada sem aprovação", () => {
    const d = decidir(
      "recompra_prevista",
      {
        contact_id: "c1",
        dias_sem_compra: 31,
        atraso_dias: 7,
        prioridade: "alta",
        tem_saldo_estoque: true,
        financeiramente_apto: true,
      },
      4,
    );
    expect(d.requer_aprovacao).toBe(false);
  });

  it("sem aptidão financeira encaminha para humano", () => {
    const d = decidir(
      "recompra_prevista",
      {
        contact_id: "c1",
        dias_sem_compra: 31,
        atraso_dias: 7,
        prioridade: "alta",
        tem_saldo_estoque: true,
        financeiramente_apto: false,
      },
      6,
    );
    expect(d.ferramenta).toBe("encaminhar_humano");
  });

  it("sem estoque agenda follow-up em vez de ofertar", () => {
    const d = decidir(
      "cliente_em_risco",
      {
        contact_id: "c1",
        dias_sem_compra: 60,
        atraso_dias: 30,
        prioridade: "alta",
        tem_saldo_estoque: false,
        financeiramente_apto: true,
      },
      5,
    );
    expect(d.ferramenta).toBe("agendar_followup");
  });
});
