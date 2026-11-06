/**
 * PATCH /api/v1/team/[user_id]/canais — números por membro (0296).
 *
 * O molde é o do role/setor/motorista (admin, membro ativo, 404/409/422),
 * porque o risco é o mesmo: escrita de um admin sobre o vínculo de outro. O
 * que difere é a forma do corpo — `string[] | null`, onde `null` NÃO é `[]`:
 * `null` devolve "todos os números" e `[]` significa "nenhum".
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
const CANAL_A = "33333333-3333-4333-8333-333333333331";
const CANAL_B = "33333333-3333-4333-8333-333333333332";
const CANAL_ALHEIO = "44444444-4444-4444-8444-444444444444";

function sessao(papel: Role = "admin") {
  const user = { id: "admin-1" } as AuthUser;
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: fail("forbidden_role", "x", 403, {}) },
  );
}

function req(corpo: unknown) {
  return new NextRequest(`http://x/api/v1/team/${ALVO}/canais`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

const params = { params: Promise.resolve({ user_id: ALVO }) };

function banco(
  membro: Record<string, unknown> | null,
  canaisDaOrg: string[] = [CANAL_A, CANAL_B],
) {
  const atualizados: Record<string, unknown>[] = [];
  const cliente = {
    from(tabela: string) {
      if (tabela === "channel_sessions") {
        const c: Record<string, unknown> = {};
        c.select = () => c;
        c.eq = () => c;
        c.in = async (_col: string, ids: string[]) => ({
          data: ids.filter((id) => canaisDaOrg.includes(id)).map((id) => ({ id })),
          error: null,
        });
        return c;
      }

      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = () => c;
      c.maybeSingle = async () => ({ data: membro, error: null });
      c.update = (v: unknown) => {
        atualizados.push(v as Record<string, unknown>);
        return { eq: async () => ({ error: null }) };
      };
      return c;
    },
  };
  return { cliente: cliente as never, atualizados };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao("admin");
});

describe("PATCH canais", () => {
  it("grava a allowlist e audita com antes/depois", async () => {
    const mem = banco({
      id: "m-1",
      user_id: ALVO,
      canais_permitidos: [CANAL_A],
      revoked_at: null,
    });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/canais/route");
    const res = await PATCH(req({ canais_permitidos: [CANAL_A, CANAL_B] }), params);

    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: { canais_permitidos: string[] } };
    expect(corpo.data.canais_permitidos).toEqual([CANAL_A, CANAL_B]);
    expect(mem.atualizados[0]?.canais_permitidos).toEqual([CANAL_A, CANAL_B]);

    const auditoria = vi.mocked(audit).mock.calls[0]?.[0] as {
      action: string;
      metadata: Record<string, unknown>;
    };
    expect(auditoria.action).toBe("team.canais_changed");
    expect(auditoria.metadata).toMatchObject({
      old_canais_permitidos: [CANAL_A],
      new_canais_permitidos: [CANAL_A, CANAL_B],
    });
  });

  it("null devolve 'todos' — e é diferente de lista vazia", async () => {
    const mem = banco({
      id: "m-1",
      user_id: ALVO,
      canais_permitidos: [CANAL_A],
      revoked_at: null,
    });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/canais/route");
    const res = await PATCH(req({ canais_permitidos: null }), params);

    expect(res.status).toBe(200);
    expect(mem.atualizados[0]?.canais_permitidos).toBeNull();
  });

  it("lista vazia grava 'nenhum' (não vira null)", async () => {
    const mem = banco({
      id: "m-1",
      user_id: ALVO,
      canais_permitidos: null,
      revoked_at: null,
    });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/canais/route");
    const res = await PATCH(req({ canais_permitidos: [] }), params);

    expect(res.status).toBe(200);
    expect(mem.atualizados[0]?.canais_permitidos).toEqual([]);
  });

  it("deduplica ids repetidos antes de gravar", async () => {
    const mem = banco({
      id: "m-1",
      user_id: ALVO,
      canais_permitidos: null,
      revoked_at: null,
    });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/canais/route");
    const res = await PATCH(req({ canais_permitidos: [CANAL_A, CANAL_A] }), params);

    expect(res.status).toBe(200);
    expect(mem.atualizados[0]?.canais_permitidos).toEqual([CANAL_A]);
  });

  it("número de outra organização é 422 e NÃO grava", async () => {
    const mem = banco({
      id: "m-1",
      user_id: ALVO,
      canais_permitidos: null,
      revoked_at: null,
    });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/canais/route");
    const res = await PATCH(req({ canais_permitidos: [CANAL_A, CANAL_ALHEIO] }), params);

    expect(res.status).toBe(422);
    expect(mem.atualizados).toHaveLength(0);
  });

  it("corpo sem a chave é 422 — omissão não desliga a restrição de ninguém", async () => {
    const mem = banco({
      id: "m-1",
      user_id: ALVO,
      canais_permitidos: [CANAL_A],
      revoked_at: null,
    });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/canais/route");
    const res = await PATCH(req({}), params);

    expect(res.status).toBe(422);
    expect(mem.atualizados).toHaveLength(0);
  });

  it("não-admin é 403", async () => {
    sessao("manager");
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/canais/route");
    const res = await PATCH(req({ canais_permitidos: null }), params);
    expect(res.status).toBe(403);
  });

  it("membro inexistente é 404; revogado é 409", async () => {
    const vazio = banco(null);
    vi.mocked(createClient).mockResolvedValue(vazio.cliente);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/canais/route");
    const inexistente = await PATCH(req({ canais_permitidos: null }), params);
    expect(inexistente.status).toBe(404);
    expect(vazio.atualizados).toHaveLength(0);

    const revogado = banco({
      id: "m-1",
      user_id: ALVO,
      canais_permitidos: null,
      revoked_at: "2026-01-01T00:00:00Z",
    });
    vi.mocked(createClient).mockResolvedValue(revogado.cliente);
    const res = await PATCH(req({ canais_permitidos: null }), params);
    expect(res.status).toBe(409);
  });
});
