/**
 * PATCH /api/v1/team/[user_id]/setor — ramal com gates.
 *
 * O molde é o do role (admin, membro ativo, 404/409/422), porque o risco é o
 * mesmo: escrita de um admin sobre vínculo de outro. O que difere é o corpo
 * (texto livre com piso, não enum).
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
  return new NextRequest(`http://x/api/v1/team/${ALVO}/setor`, {
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

describe("PATCH setor", () => {
  it("grava o setor e audita com antes/depois", async () => {
    const mem = banco({ id: "m-1", user_id: ALVO, setor: "Vendas", revoked_at: null });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/setor/route");
    const res = await PATCH(req({ setor: "Faturamento" }), params);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: { setor: string } };
    expect(corpo.data.setor).toBe("Faturamento");
    expect(mem.atualizados[0]?.setor).toBe("Faturamento");
    const auditoria = vi.mocked(audit).mock.calls[0]?.[0] as {
      action: string;
      metadata: Record<string, unknown>;
    };
    expect(auditoria.action).toBe("team.setor_changed");
    expect(auditoria.metadata).toMatchObject({ old_setor: "Vendas", new_setor: "Faturamento" });
  });

  it("null limpa — e limpar desliga a assinatura", async () => {
    const mem = banco({ id: "m-1", user_id: ALVO, setor: "Vendas", revoked_at: null });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/setor/route");
    const res = await PATCH(req({ setor: null }), params);
    expect(res.status).toBe(200);
    expect(mem.atualizados[0]?.setor).toBeNull();
  });

  it("1 letra é 422 — sigla que ninguém entende", async () => {
    const mem = banco({ id: "m-1", user_id: ALVO, setor: null, revoked_at: null });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/setor/route");
    const res = await PATCH(req({ setor: "X" }), params);
    expect(res.status).toBe(422);
    expect(mem.atualizados).toHaveLength(0);
  });

  it("string vazia é 422, não limpeza silenciosa", async () => {
    // "" não é null: aceitar vazio e gravar vazio assinaria errado em vez de
    // não assinar. Quem quer limpar manda null, explícito.
    const mem = banco({ id: "m-1", user_id: ALVO, setor: "Vendas", revoked_at: null });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/setor/route");
    const res = await PATCH(req({ setor: "" }), params);
    expect(res.status).toBe(422);
  });

  it("não-admin é 403", async () => {
    sessao("agent");
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/setor/route");
    const res = await PATCH(req({ setor: "Vendas" }), params);
    expect(res.status).toBe(403);
  });

  it("membro inexistente é 404; revogado é 409", async () => {
    const vazio = banco(null);
    vi.mocked(createClient).mockResolvedValue(vazio.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/setor/route");
    expect((await PATCH(req({ setor: "Vendas" }), params)).status).toBe(404);

    const revogado = banco({ id: "m-1", user_id: ALVO, setor: null, revoked_at: "2026-01-01" });
    vi.mocked(createClient).mockResolvedValue(revogado.cliente);
    expect((await PATCH(req({ setor: "Vendas" }), params)).status).toBe(409);
  });
});
