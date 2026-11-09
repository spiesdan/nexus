// @vitest-environment node
// O montar do lote é puro de dados (builder do Supabase mockado) — sem DOM.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import type { AuthUser, Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/audit", () => ({ isServiceRoleConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { montarPedidosPdf } from "@/lib/comercial/montar-pedidos";

const ORG = "22222222-2222-4222-8222-222222222222";
const PEDIDO_ID = "33333333-3333-4333-8333-333333333333";

function builderCom(dados: unknown) {
  const builder: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "in", "order", "limit", "gte", "lte", "ilike"]) {
    builder[metodo] = () => builder;
  }
  builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve({ data: dados, error: null }).then(res, rej);
  return builder;
}

function clienteCom(tabelas: Record<string, unknown[]>) {
  const builders: Record<string, unknown> = {};
  for (const tabela of Object.keys(tabelas)) builders[tabela] = builderCom(tabelas[tabela]);
  const de = (tabela: string) => (builders[tabela] ?? builderCom([]));
  return { from: de } as never;
}

function pedidoMercos(): Record<string, unknown> {
  return {
    id: PEDIDO_ID,
    numero: 19432,
    contact_id: null,
    cliente_nome: "IZABELA HOFFMANN IATCZAK LTDA",
    cliente_documento: null,
    created_by: null,
    vendedor_user_id: null,
    vendedor_nome: "VENDEDOR JB",
    endereco_entrega: "RUA DEPUTADO JOAO F. NEVES, 85 — CENTRO, SÃO JOÃO DO TRIUNFO/PR, 84150000",
    status: "expedido",
    subtotal_cents: 10000,
    desconto_cents: 0,
    frete_cents: 0,
    total_cents: 10000,
    condicao_pagamento: "AVISTA",
    observacoes: null,
    created_at: "2026-11-09T12:00:00Z",
  };
}

function sessao() {
  const user: AuthUser = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "ana@example.com",
    full_name: "Ana",
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: "viewer" as Role }],
  };
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user,
    org: { orgId: ORG, name: "Org", role: "viewer" },
  });
}

beforeEach(() => {
  sessao();
});

describe("montarPedidosPdf — vendedor do PDF", () => {
  it("usa o vendedor gravado no pedido (Mercos) quando não há vendedor de usuário", async () => {
    vi.mocked(createClient).mockReturnValue(clienteCom({ commercial_orders: [pedidoMercos()] }) as never);
    vi.mocked(createAdminClient).mockReturnValue({} as never);

    const supabase = createClient() as never;
    const [pedido] = await montarPedidosPdf(supabase, ORG, [PEDIDO_ID]);
    expect(pedido?.vendedor_nome).toBe("VENDEDOR JB");
  });

  it("usa o nome do usuário quando o vendedor foi resolvido", async () => {
    vi.mocked(createClient).mockReturnValue(
      clienteCom({
        commercial_orders: [{ ...pedidoMercos(), vendedor_user_id: "11111111-1111-4111-8111-111111111111" }],
      }) as never,
    );
    const adminCom = {
      auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: { user_metadata: { full_name: "Ana" } } } })) } },
    } as never;
    vi.mocked(createAdminClient).mockReturnValue(adminCom);

    const supabase = createClient() as never;
    const [pedido] = await montarPedidosPdf(supabase, ORG, [PEDIDO_ID]);
    expect(pedido?.vendedor_nome).toBe("Ana");
  });
});
