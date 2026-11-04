/**
 * PATCH /api/v1/team/[user_id]/motorista — o modo entregador (0292).
 *
 * O risco é o mesmo do setor e do papel: escrita de um admin sobre o vínculo
 * de outra pessoa. O que este teste protege é a fronteira que a flag NÃO
 * cruza — ela esconde casca, não concede permissão, então o gate continua
 * sendo `admin` e o registro continua caindo na auditoria.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

const ORG = "11111111-1111-4111-8111-111111111111";
const ALVO = "22222222-2222-4222-8222-222222222222";

function sessao(papel: Role = "admin") {
  const user = { id: "admin-1" } as AuthUser;
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: fail("forbidden_role", "x", 403, {}) },
  );
}

function req(corpo: unknown) {
  return new NextRequest(`http://x/api/v1/team/${ALVO}/motorista`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

const params = { params: Promise.resolve({ user_id: ALVO }) };

function banco(membro: Record<string, unknown> | null) {
  const atualizados: Record<string, unknown>[] = [];
  const cadeia = () => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.maybeSingle = async () => ({ data: membro, error: null });
    c.update = (v: unknown) => {
      atualizados.push(v as Record<string, unknown>);
      return { eq: async () => ({ error: null }) };
    };
    return c;
  };
  return { cliente: { from: (_t: string) => cadeia() } as never, atualizados };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao("admin");
});

describe("PATCH motorista", () => {
  it("liga a flag e audita com antes/depois", async () => {
    const mem = banco({ id: "m-1", user_id: ALVO, motorista: false, revoked_at: null });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/motorista/route");
    const res = await PATCH(req({ motorista: true }), params);
    expect(res.status).toBe(200);
    expect(mem.atualizados[0]?.motorista).toBe(true);
    const auditoria = vi.mocked(audit).mock.calls[0]?.[0] as {
      action: string;
      metadata: Record<string, unknown>;
    };
    expect(auditoria.action).toBe("team.motorista_changed");
    expect(auditoria.metadata).toMatchObject({ old_motorista: false, new_motorista: true });
  });

  it("desliga a flag (volta ao menu e à home)", async () => {
    const mem = banco({ id: "m-1", user_id: ALVO, motorista: true, revoked_at: null });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/motorista/route");
    const res = await PATCH(req({ motorista: false }), params);
    expect(res.status).toBe(200);
    expect(mem.atualizados[0]?.motorista).toBe(false);
  });

  it("corpo sem boolean é 422 — não aceita 'sim' nem 1", async () => {
    const mem = banco({ id: "m-1", user_id: ALVO, motorista: false, revoked_at: null });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/motorista/route");
    expect((await PATCH(req({ motorista: "true" }), params)).status).toBe(422);
    expect(mem.atualizados).toHaveLength(0);
  });

  it("não-admin é 403: entregador não se promove", async () => {
    sessao("agent");
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/motorista/route");
    expect((await PATCH(req({ motorista: true }), params)).status).toBe(403);
  });

  it("membro inexistente é 404; revogado é 409", async () => {
    vi.mocked(createClient).mockResolvedValue(banco(null).cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/motorista/route");
    expect((await PATCH(req({ motorista: true }), params)).status).toBe(404);

    vi.mocked(createClient).mockResolvedValue(
      banco({ id: "m-1", user_id: ALVO, motorista: false, revoked_at: "2026-01-01" }).cliente,
    );
    expect((await PATCH(req({ motorista: true }), params)).status).toBe(409);
  });
});
