import { describe, expect, it } from "vitest";

import {
  classificarAssinatura,
  motivoNaoVerificado,
  proximoVencimento,
  resumirEstados,
  tempoRelativo,
  ultimaCobranca,
  valorDoPlano,
  type EntradaClassificacao,
  type FaturaLocal,
} from "@/lib/billing/visao-plataforma";

/**
 * O DE/PARA ESTADO → RÓTULO.
 *
 * O caso que justifica o módulo: `customer` existe e a assinatura não foi lida.
 * A resposta certa é `nao_verificado`. "Sem assinatura" ali é uma acusação de
 * inadimplência feita com base em ausência de dado — e é a decisão de negócio
 * (suspender, cobrar, ligar) que essa palavra dispara.
 */

const AGORA = new Date("2026-11-25T12:00:00Z");

function fatura(over: Partial<FaturaLocal> = {}): FaturaLocal {
  return {
    status: "paid",
    amount_cents: 169_900,
    currency: "BRL",
    due_at: "2026-11-16T00:00:00Z",
    paid_at: "2026-11-16T00:00:00Z",
    created_at: "2026-11-01T00:00:00Z",
    ...over,
  };
}

function entrada(over: Partial<EntradaClassificacao> = {}): EntradaClassificacao {
  return {
    customer: { stripe_customer_id: "cus_123" },
    assinatura: { status: "active", current_period_end: "2026-12-16T00:00:00Z", cancel_at_period_end: false },
    faturas: [fatura()],
    agora: AGORA,
    ...over,
  };
}

describe("classificação da assinatura", () => {
  it.each([
    ["active", "ativa"],
    ["trialing", "ativa"],
    ["past_due", "em_atraso"],
    ["unpaid", "em_atraso"],
    ["incomplete", "em_atraso"],
    ["canceled", "cancelada"],
    ["incomplete_expired", "cancelada"],
  ])("status %s → %s", (status, esperado) => {
    expect(
      classificarAssinatura(
        entrada({ assinatura: { status, current_period_end: null, cancel_at_period_end: false }, faturas: [] }),
      ),
    ).toBe(esperado);
  });

  it("sem cliente, sem assinatura e sem fatura → sem_assinatura", () => {
    expect(classificarAssinatura(entrada({ customer: null, assinatura: null, faturas: [] }))).toBe(
      "sem_assinatura",
    );
  });

  it("CUSTOMER EXISTE SEM LEITURA → nao_verificado, nunca sem_assinatura", () => {
    const e = entrada({ customer: { stripe_customer_id: "cus_123" }, assinatura: null, faturas: [] });
    expect(classificarAssinatura(e)).toBe("nao_verificado");
    expect(motivoNaoVerificado(e)).toContain("Cliente Stripe existe");
  });

  it("fatura sem cliente nem assinatura também não vira 'sem assinatura'", () => {
    expect(classificarAssinatura(entrada({ customer: null, assinatura: null, faturas: [fatura()] }))).toBe(
      "nao_verificado",
    );
  });

  it("status desconhecido (paused, status novo do Stripe) → nao_verificado", () => {
    expect(
      classificarAssinatura(
        entrada({ assinatura: { status: "paused", current_period_end: null, cancel_at_period_end: false } }),
      ),
    ).toBe("nao_verificado");
  });

  it("fatura vencida em aberto manda mais que o status local 'active'", () => {
    const e = entrada({
      faturas: [
        fatura({ status: "unpaid", paid_at: null, due_at: "2026-11-16T00:00:00Z", created_at: "2026-11-01T00:00:00Z" }),
      ],
    });
    expect(classificarAssinatura(e)).toBe("em_atraso");
  });

  it("cancelada com fatura antiga em aberto continua cancelada (churn não é atraso)", () => {
    const e = entrada({
      assinatura: { status: "canceled", current_period_end: null, cancel_at_period_end: false },
      faturas: [fatura({ status: "unpaid", paid_at: null, due_at: "2026-10-16T00:00:00Z" })],
    });
    expect(classificarAssinatura(e)).toBe("cancelada");
    expect(ultimaCobranca(e.faturas, AGORA).texto).toBe("falhou");
  });

  it("fatura em aberto com vencimento futuro não é atraso", () => {
    const e = entrada({
      faturas: [fatura({ status: "open", paid_at: null, due_at: "2026-12-16T00:00:00Z" })],
    });
    expect(classificarAssinatura(e)).toBe("ativa");
  });
});

describe("textos da linha", () => {
  it("última cobrança paga sai com o dia do pagamento", () => {
    expect(ultimaCobranca([fatura()], AGORA).texto).toBe("paga em 16/11/2026");
  });

  it("contagem de falhas vira 'falhou 2×' — e é contagem de faturas", () => {
    const cobranca = ultimaCobranca(
      [
        fatura({ status: "unpaid", paid_at: null, created_at: "2026-11-20T00:00:00Z" }),
        fatura({ status: "action_required", paid_at: null, created_at: "2026-11-10T00:00:00Z" }),
        fatura(),
      ],
      AGORA,
    );
    expect(cobranca.falhas).toBe(2);
    expect(cobranca.texto).toBe("falhou 2×");
  });

  it("próximo vencimento de fatura vencida diz 'venceu dd/mm'", () => {
    const e = entrada({
      assinatura: { status: "past_due", current_period_end: "2026-12-16T00:00:00Z", cancel_at_period_end: false },
      faturas: [fatura({ status: "unpaid", paid_at: null, due_at: "2026-11-16T00:00:00Z" })],
    });
    expect(proximoVencimento(e, AGORA)).toMatchObject({ texto: "venceu 16/11/2026", vencido: true });
  });

  it("valor vem do plano no banco (R$ 1.699,00)", () => {
    expect(valorDoPlano({ valor_cents: 169_900, moeda: "BRL" })).toBe("R$ 1.699,00");
    expect(valorDoPlano(null)).toBeNull();
  });

  it("frescor é relativo e honesto", () => {
    expect(tempoRelativo("2026-11-25T11:58:00Z", AGORA)).toBe("há 2 min");
    expect(tempoRelativo("2026-11-24T12:00:00Z", AGORA)).toBe("há 1 d");
    expect(tempoRelativo(null, AGORA)).toBeNull();
  });
});

describe("contagens que somam o total", () => {
  it("os quatro rótulos fecham quando não há não-verificadas", () => {
    const r = resumirEstados(["ativa", "em_atraso", "sem_assinatura", "cancelada"]);
    expect(r.somaDosQuatro).toBe(4);
    expect(r.diferenca).toBe(0);
    expect(r.fecha).toBe(true);
  });

  it("não-verificada aparece na DIFERENÇA, não escondida", () => {
    const r = resumirEstados(["ativa", "nao_verificado", "nao_verificado"], 3);
    expect(r.contagens.nao_verificado).toBe(2);
    expect(r.somaDosQuatro).toBe(1);
    expect(r.diferenca).toBe(2);
    expect(r.fecha).toBe(false);
  });

  it("total de organizações maior que as linhas lidas também vira diferença", () => {
    const r = resumirEstados(["ativa"], 5);
    expect(r.diferenca).toBe(4);
  });
});
