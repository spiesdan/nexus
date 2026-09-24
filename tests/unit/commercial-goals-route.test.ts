/**
 * METAS TÊM DONO E PAPEL — o denominador do dashboard não é editável por quem
 * só atende.
 *
 * Guarda o contrato da rota `/api/v1/commercial-goals`:
 * - GET exige `ano_mes` válido e devolve as metas da org da sessão;
 * - PUT exige `manager` (agent/viewer tomam 403 no `requireRole`, antes de
 *   qualquer escrita);
 * - PUT atualiza quando a linha existe e insere quando não existe (os índices
 *   únicos são parciais e NULL não colide — sem onConflict).
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type ActiveOrg, type AuthUser, type Role } from "@/lib/auth/types";
import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";

function sessao(papel: Role) {
  const usuario: AuthUser = {
    id: ANA,
    email: "ana@empresa.com",
    full_name: "Ana",
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR",
    organizations: [],
  };
  const org: ActiveOrg = { orgId: ORG, name: "Org", role: papel };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? {
          ok: true,
          user: usuario,
          org,
        }
      : { ok: false, response: fail("forbidden_role", "sem papel", 403, {}) },
  );
}

/** Dublê encadeável mínimo do supabase-js para esta rota. */
function fazerSupabase(respostas: { updateSel: unknown[] | null; insertErr: unknown }) {
  // Toda chamada encadeia e o `await` final resolve o resultado da operação:
  // select → linhas, update → linhas atualizadas, insert → só erro.
  const cadeia = (resultado: unknown): unknown =>
    new Proxy(
      {},
      {
        get: (_alvo, prop) => {
          if (prop === "then") return (ok: (v: unknown) => unknown) => Promise.resolve(resultado).then(ok);
          return () => cadeia(resultado);
        },
      },
    );
  const from = () => ({
    select: () =>
      cadeia({ data: [{ vendedor_user_id: null, valor_cents: 300000 }], error: null }),
    update: () => cadeia({ data: respostas.updateSel, error: null }),
    insert: () => cadeia({ error: respostas.insertErr }),
  });
  vi.mocked(createClient).mockResolvedValue({ from } as never);
}

function pedido(url: string, corpo?: unknown) {
  return new NextRequest(`http://x${url}`, {
    method: corpo === undefined ? "GET" : "PUT",
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao("manager");
});

describe("GET /api/v1/commercial-goals", () => {
  it("exige ano_mes válido", async () => {
    fazerSupabase({ updateSel: [], insertErr: null });
    const { GET } = await import("@/app/api/v1/commercial-goals/route");
    expect((await GET(pedido("/api/v1/commercial-goals"))).status).toBe(422);
    expect((await GET(pedido("/api/v1/commercial-goals?ano_mes=2026-13"))).status).toBe(422);
  });

  it("devolve as metas da org", async () => {
    fazerSupabase({ updateSel: [], insertErr: null });
    const { GET } = await import("@/app/api/v1/commercial-goals/route");
    const res = await GET(pedido("/api/v1/commercial-goals?ano_mes=2026-09"));
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: { valor_cents: number }[] };
    expect(corpo.data[0]?.valor_cents).toBe(300000);
  });
});

describe("PUT /api/v1/commercial-goals", () => {
  it("viewer não define meta", async () => {
    sessao("viewer");
    fazerSupabase({ updateSel: [], insertErr: null });
    const { PUT } = await import("@/app/api/v1/commercial-goals/route");
    const res = await PUT(pedido("/api/v1/commercial-goals", { ano_mes: "2026-09", valor_cents: 100 }));
    expect(res.status).toBe(403);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("agent não define meta", async () => {
    sessao("agent");
    fazerSupabase({ updateSel: [], insertErr: null });
    const { PUT } = await import("@/app/api/v1/commercial-goals/route");
    const res = await PUT(pedido("/api/v1/commercial-goals", { ano_mes: "2026-09", valor_cents: 100 }));
    expect(res.status).toBe(403);
  });

  it("recusa corpo inválido sem escrever", async () => {
    const espiao = { updateSel: [] as unknown[], insertErr: null };
    fazerSupabase(espiao);
    const { PUT } = await import("@/app/api/v1/commercial-goals/route");
    const res = await PUT(pedido("/api/v1/commercial-goals", { ano_mes: "2026-09", valor_cents: -5 }));
    expect(res.status).toBe(422);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("atualiza quando a linha existe e audita", async () => {
    fazerSupabase({ updateSel: [{ id: "g1" }], insertErr: null });
    const { PUT } = await import("@/app/api/v1/commercial-goals/route");
    const res = await PUT(pedido("/api/v1/commercial-goals", { ano_mes: "2026-09", valor_cents: 30000000 }));
    expect(res.status).toBe(200);
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "commercial_goal.saved", organizationId: ORG }),
    );
  });

  it("insere quando a linha não existe", async () => {
    fazerSupabase({ updateSel: [], insertErr: null });
    const { PUT } = await import("@/app/api/v1/commercial-goals/route");
    const res = await PUT(pedido("/api/v1/commercial-goals", { ano_mes: "2026-09", valor_cents: 30000000 }));
    expect(res.status).toBe(200);
  });
});
