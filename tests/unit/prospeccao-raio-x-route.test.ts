/**
 * POST /api/v1/prospecting/prospects/[id]/raio-x — analisa, grava, devolve.
 *
 * O que se mede é a DECISÃO da rota (auth, validações, o que grava), não a
 * análise em si (17 casos em `prospeccao-raio-x.test.ts`). O fetch e o DNS são
 * dublados — esta spec roda sem rede.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ORG = "11111111-1111-4111-8111-111111111111";
const PROSPECT = "22222222-2222-4222-8222-222222222222";

function sessao(papel: Role = "agent") {
  const user = { id: "user-1" } as AuthUser;
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: fail("forbidden_role", "x", 403, {}) },
  );
}

function req() {
  return new NextRequest(`http://x/api/v1/prospecting/prospects/${PROSPECT}/raio-x`, {
    method: "POST",
  });
}

function banco(prospect: Record<string, unknown> | null) {
  const gravado: Record<string, unknown>[] = [];
  const cadeia = (tabela: string) => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.maybeSingle = async () => ({ data: prospect, error: null });
    c.update = (v: unknown) => {
      gravado.push(v as Record<string, unknown>);
      return { eq: () => ({ eq: async () => ({ error: null }) }) };
    };
    void tabela;
    return c;
  };
  const cliente = { from: (t: string) => cadeia(t) };
  return { cliente: cliente as never, gravado };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao("agent");
});

describe("POST raio-x", () => {
  it("sem site cadastrado é 422 — e NÃO grava `sem_site`", async () => {
    // `sem_site` diz "verifiquei e não há". Sem site não há o que verificar;
    // gravar seria mentir, e o score trata os dois diferente (0 vs 5).
    const mem = banco({ id: PROSPECT, nome: "P", website: null });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    vi.mocked(createAdminClient).mockReturnValue(mem.cliente);
    const { POST } = await import("@/app/api/v1/prospecting/prospects/[id]/raio-x/route");
    const res = await POST(req(), { params: Promise.resolve({ id: PROSPECT }) });
    expect(res.status).toBe(422);
    expect(mem.gravado).toHaveLength(0);
  });

  it("prospect de outra org é 404", async () => {
    const mem = banco(null);
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    vi.mocked(createAdminClient).mockReturnValue(mem.cliente);
    const { POST } = await import("@/app/api/v1/prospecting/prospects/[id]/raio-x/route");
    const res = await POST(req(), { params: Promise.resolve({ id: PROSPECT }) });
    expect(res.status).toBe(404);
  });

  it("viewer não roda análise — ver não é fazer", async () => {
    sessao("viewer");
    const { POST } = await import("@/app/api/v1/prospecting/prospects/[id]/raio-x/route");
    const res = await POST(req(), { params: Promise.resolve({ id: PROSPECT }) });
    expect(res.status).toBe(403);
  });

  it("caminho feliz sem rede: IP literal trava antes do fetch e grava", async () => {
    // `http://127.0.0.1/` é barrado pelo literal-IP sem resolver nem buscar —
    // então este teste exercita o caminho inteiro (análise → gravação →
    // auditoria) sem um request sequer.
    const mem = banco({ id: PROSPECT, nome: "P", website: "http://127.0.0.1:3000/" });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    vi.mocked(createAdminClient).mockReturnValue(mem.cliente);
    const { POST } = await import("@/app/api/v1/prospecting/prospects/[id]/raio-x/route");
    const res = await POST(req(), { params: Promise.resolve({ id: PROSPECT }) });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: { situacao: string } };
    expect(corpo.data.situacao).toBe("nao_verificado");
    expect(mem.gravado).toHaveLength(1);
    expect(mem.gravado[0]?.site_situacao).toBe("nao_verificado");
    expect(typeof mem.gravado[0]?.site_verificado_em).toBe("string");
  });
});
