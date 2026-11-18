import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  dividirParcelas,
  erroDePagamentoDoBanco,
  gerarRecebiveis,
  prazosDaCondicao,
  situacaoDe,
  somarPagamentos,
  validarPagamento,
} from "./financeiro";

describe("prazosDaCondicao", () => {
  it("30/60/90 vira 3 prazos; à vista e texto solto viram null", () => {
    expect(prazosDaCondicao("30/60/90")).toEqual([30, 60, 90]);
    expect(prazosDaCondicao("28 dias")).toBeNull();
    expect(prazosDaCondicao("à vista")).toBeNull();
    expect(prazosDaCondicao(null)).toBeNull();
  });
});

describe("dividirParcelas", () => {
  it("1000 em 3x: 333,33 + 333,33 + 333,34 com vencimentos", () => {
    const ps = dividirParcelas(100000, "30/60/90", "2026-09-01");
    expect(ps.map((p) => p.valor_cents)).toEqual([33333, 33333, 33334]);
    expect(ps.map((p) => p.vencimento)).toEqual(["2026-10-01", "2026-10-31", "2026-11-30"]);
    expect(ps.reduce((s, p) => s + p.valor_cents, 0)).toBe(100000);
  });

  it("à vista vira parcela única no dia da emissão", () => {
    expect(dividirParcelas(50000, null, "2026-09-01")).toEqual([
      { n: 1, valor_cents: 50000, vencimento: "2026-09-01" },
    ]);
  });
});

describe("situacaoDe", () => {
  const base = { valor_original_cents: 100000, vencimento: "2026-09-05" } as const;
  it("pago, parcial, aberto e vencido com dias de atraso", () => {
    expect(situacaoDe({ ...base, status: "aberto" }, [{ valor_cents: 100000 }], "2026-09-08").situacao).toBe("pago");
    const parcial = situacaoDe({ ...base, status: "aberto" }, [{ valor_cents: 40000 }], "2026-09-08");
    expect(parcial.situacao).toBe("parcial");
    expect(parcial.saldo_cents).toBe(60000);
    expect(situacaoDe({ ...base, status: "aberto" }, [], "2026-09-01").situacao).toBe("aberto");
    const vencido = situacaoDe({ ...base, status: "aberto" }, [], "2026-09-08");
    expect(vencido.situacao).toBe("vencido");
    expect(vencido.diasAtraso).toBe(3);
    expect(situacaoDe({ ...base, status: "cancelado" }, [], "2026-09-08").situacao).toBe("cancelado");
  });
});

describe("erroDePagamentoDoBanco", () => {
  it("o trigger 0314 vira 422, não 500: mesma resposta da validação em memória", () => {
    expect(erroDePagamentoDoBanco({ message: "financial_payment_acima_do_saldo" })).toBe("acima_do_saldo");
    expect(erroDePagamentoDoBanco({ message: "financial_payment_recebivel_fechado" })).toBe(
      "recebivel_fechado",
    );
    expect(erroDePagamentoDoBanco({ message: "financial_payment_recebivel_nao_encontrado" })).toBe(
      "nao_achado",
    );
  });

  it("erro desconhecido continua erro interno (não mascara falha de infraestrutura)", () => {
    expect(erroDePagamentoDoBanco({ code: "57P01", message: "terminating connection" })).toBeNull();
    expect(erroDePagamentoDoBanco(null)).toBeNull();
  });
});

describe("validarPagamento", () => {
  it("teto do caixa: nunca acima do saldo, nunca zerado, nunca em conta fechada", () => {
    expect(validarPagamento(100001, 100000)).toBe("acima_do_saldo");
    expect(validarPagamento(0, 100000)).toBe("valor_invalido");
    expect(validarPagamento(-5, 100000)).toBe("valor_invalido");
    expect(validarPagamento(1, 0)).toBe("recebivel_fechado");
    expect(validarPagamento(40000, 100000)).toBeNull();
    expect(validarPagamento(100000, 100000)).toBeNull();
  });

  it("soma de pagamentos sustenta o saldo", () => {
    expect(somarPagamentos([{ valor_cents: 400 }, { valor_cents: 600 }])).toBe(1000);
  });
});

/**
 * O GERADOR É IDEMPOTENTE — a garantia que o D1 usa para chamar depois da
 * autorização da NF-e sem duplicar.
 *
 * O dublê reproduz o banco em dois pontos: a leitura das parcelas existentes e
 * a unique `(organization_id, order_id, parcela_n)` devolvendo 23505 para a
 * parcela que outra requisição acabou de gravar.
 */
describe("gerarRecebiveis — retry e concorrência", () => {
  function banco(over: { existentes?: number[]; conflitantes?: number[] } = {}) {
    const inseridas: number[] = [];
    const client = {
      from: (tabela: string) => {
        if (tabela !== "financial_receivables") throw new Error(`tabela inesperada: ${tabela}`);
        let op: "select" | "insert" = "select";
        let valores: { parcela_n: number } | null = null;
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.insert = (v: { parcela_n: number }) => {
          op = "insert";
          valores = v;
          return q;
        };
        q.single = () => {
          const parcela = valores!.parcela_n;
          if (over.conflitantes?.includes(parcela)) {
            return Promise.resolve({
              data: null,
              error: { code: "23505", message: "duplicate key" },
            });
          }
          inseridas.push(parcela);
          return Promise.resolve({ data: { id: `rec-${parcela}` }, error: null });
        };
        q.then = (ok: (v: unknown) => unknown) => {
          if (op === "select") {
            return Promise.resolve({
              data: (over.existentes ?? []).map((parcela_n) => ({ parcela_n })),
              error: null,
            }).then(ok);
          }
          return Promise.resolve({ data: null, error: null }).then(ok);
        };
        return q;
      },
    };
    return { client: client as unknown as SupabaseClient, inseridas };
  }

  it("pula a parcela que já existe (retry do PATCH/NF não duplica)", async () => {
    const { client, inseridas } = banco({ existentes: [1] });
    const r = await gerarRecebiveis(client, {
      orgId: "org-1",
      orderId: "pedido-1",
      contactId: "contato-1",
      totalCents: 30000,
      condicao: "30/60/90",
      baseIso: "2026-11-01",
      criadoPor: null,
    });
    expect(inseridas).toEqual([2, 3]);
    expect(r).toMatchObject({ criados: 2, existentes: 1 });
  });

  it("23505 da corrida conta como existente em vez de estourar", async () => {
    const { client, inseridas } = banco({ conflitantes: [2, 3] });
    const r = await gerarRecebiveis(client, {
      orgId: "org-1",
      orderId: "pedido-1",
      contactId: "contato-1",
      totalCents: 30000,
      condicao: "30/60/90",
      baseIso: "2026-11-01",
      criadoPor: null,
    });
    expect(inseridas).toEqual([1]);
    expect(r).toMatchObject({ criados: 1, existentes: 2 });
  });
});
