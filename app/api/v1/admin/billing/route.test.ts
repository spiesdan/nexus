import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A REGRA MAIS CARA DA TELA: a lista NÃO chama o Stripe.
 *
 * Uma chamada por linha é N+1: com 50 organizações a tela abriria 50
 * requisições síncronas. O teste conta as chamadas — zero — e prova também que
 * a rota continua respondendo quando o Stripe não está configurado (nada de
 * 500 nem lista vazia silenciosa).
 */

vi.mock("@/lib/auth/requirePlatformAdmin", () => ({
  requirePlatformAdmin: vi.fn(),
  escopoPermiteEscrita: () => true,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/billing/stripe", () => ({
  lerConfigStripe: vi.fn(),
  stripeRequest: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { stripeRequest } from "@/lib/billing/stripe";

import { GET } from "./route";

const ORG = "11111111-1111-4111-8111-111111111111";

type Resultado = { data: unknown; error: { message: string } | null };

/** Builder que honra o encadeamento usado pelo carregador. */
function builder(resultado: Resultado) {
  const q: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "is", "order", "limit"]) q[metodo] = () => q;
  q.maybeSingle = async () => resultado;
  q.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
    Promise.resolve(resultado).then(ok, falha);
  return q;
}

const from = vi.fn();

function montarBanco() {
  from.mockImplementation((tabela: string) => {
    switch (tabela) {
      case "organizations":
        return builder({ data: [{ id: ORG, display_name: "Loja Ativa", slug: "loja-ativa" }], error: null });
      case "billing_plans":
        return builder({
          data: { nome: "Nexus", valor_cents: 169_900, moeda: "BRL", intervalo: "mensal" },
          error: null,
        });
      case "billing_customers":
        // Customer existe; a assinatura NUNCA foi lida (nenhuma linha abaixo).
        return builder({ data: [{ organization_id: ORG, stripe_customer_id: "cus_123", updated_at: null }], error: null });
      case "billing_subscriptions":
        return builder({ data: [], error: null });
      case "billing_invoices":
        return builder({ data: [], error: null });
      case "billing_verifications":
        return builder({ data: [], error: null });
      case "billing_events":
        return builder({ data: null, error: null });
      default:
        return builder({ data: [], error: null });
    }
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
}

async function corpo(res: Response) {
  return (await res.json()) as {
    data: {
      linhas: Array<{ organizacao: string; situacao: string; valor_texto: string | null; motivo: string | null }>;
      stripe: { configurado: boolean; motivo: string | null };
      sincronizado_texto: string;
    };
  };
}

const envOriginal = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: "admin-1" },
    platformAdmin: { user_id: "admin-1", scope: "full", mfa_required: false },
  } as never);
  montarBanco();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  process.env = { ...envOriginal };
  vi.unstubAllGlobals();
});

describe("GET /api/v1/admin/billing", () => {
  it("não chama o Stripe — nem por linha, nem uma vez", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_chave";

    const res = await GET(new Request("http://localhost/api/v1/admin/billing") as never);
    expect(res.status).toBe(200);

    expect(stripeRequest).toHaveBeenCalledTimes(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    const { data } = await corpo(res);
    expect(data.stripe.configurado).toBe(true);
    expect(data.linhas).toHaveLength(1);
    expect(data.linhas[0]!.organizacao).toBe("Loja Ativa");
  });

  it("customer sem leitura aparece como não verificada, nunca como 'sem assinatura'", async () => {
    const res = await GET(new Request("http://localhost/api/v1/admin/billing") as never);
    const { data } = await corpo(res);
    expect(data.linhas[0]!.situacao).toBe("nao_verificado");
    expect(data.linhas[0]!.motivo).toContain("Cliente Stripe existe");
  });

  it("sem Stripe configurado a rota abre (200), diz o motivo e não quebra", async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const res = await GET(new Request("http://localhost/api/v1/admin/billing") as never);
    expect(res.status).toBe(200);

    const { data } = await corpo(res);
    expect(data.stripe.configurado).toBe(false);
    expect(data.stripe.motivo).toBe("sem_chave");
    expect(data.sincronizado_texto).toBe("Nunca sincronizado com o Stripe");
    expect(data.linhas).toHaveLength(1);
    expect(stripeRequest).toHaveBeenCalledTimes(0);
  });
});
