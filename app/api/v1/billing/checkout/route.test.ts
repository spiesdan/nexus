import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  stripeRequest: vi.fn(async (
    _cfg: unknown,
    _path: string,
    _opcoes?: { idempotencyKey?: string; corpo?: Record<string, string> },
  ) => ({
    ok: true as const,
    data: { id: "cs_test_1", url: "https://checkout.stripe.com/x", expires_at: null },
  })),
  assinaturas: [] as Array<{ status: string }>,
  customer: "cus_existe" as string | null,
}));

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn(async () => ({ ok: true, org: { orgId: "org-1" } })),
}));
vi.mock("@/lib/billing/stripe", () => ({
  lerConfigStripe: () => ({ secretKey: "sk_test_x", webhookSecret: "", priceId: "price_1", apiBase: "" }),
  stripeRequest: m.stripeRequest,
}));
vi.mock("@/lib/billing/verificacao", () => ({ registrarVerificacao: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const encadeado = {
        select: () => encadeado,
        eq: () => encadeado,
        limit: () => encadeado,
        maybeSingle: async () => {
          if (tabela === "billing_customers") return { data: { stripe_customer_id: m.customer } };
          if (tabela === "billing_plans") return { data: { stripe_price_id: "price_1" } };
          return { data: null };
        },
        in: async () => ({ data: m.assinaturas }),
        insert: async () => ({ error: null }),
      };
      return encadeado;
    },
  }),
}));

import { POST } from "./route";

describe("POST /billing/checkout — antes de cobrar, olhar o que existe", () => {
  beforeEach(() => {
    m.assinaturas = [];
    m.customer = "cus_existe";
    m.stripeRequest.mockClear();
  });

  it("assinatura ativa: 409 e nenhuma sessão criada", async () => {
    m.assinaturas = [{ status: "active" }];
    const res = await POST();
    expect(res.status).toBe(409);
    expect(m.stripeRequest).not.toHaveBeenCalled();
  });

  it("sem assinatura: cria sessão REUSANDO o customer", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const corpo = m.stripeRequest.mock.calls[0]?.[2]?.corpo;
    expect(corpo?.customer).toBe("cus_existe");
  });

  it("dois cliques seguidos: UMA chave de idempotência", async () => {
    await POST();
    await POST();
    const chaves = m.stripeRequest.mock.calls.map((c) => c[2]?.idempotencyKey);
    expect(new Set(chaves).size).toBe(1);
  });
});
