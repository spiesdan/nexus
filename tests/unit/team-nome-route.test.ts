/**
 * PATCH /api/v1/team/[user_id]/nome — nome com gates e merge de metadata.
 *
 * O que difere do setor: o nome mora em `auth.users.user_metadata` (GLOBAL),
 * então o teste central é o merge — trocar o nome não pode apagar as outras
 * chaves que outro fluxo guardou lá.
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

import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
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
  return new NextRequest(`http://x/api/v1/team/${ALVO}/nome`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

const params = { params: Promise.resolve({ user_id: ALVO }) };

function banco(meta: Record<string, unknown>) {
  const escritas: Record<string, unknown>[] = [];
  const cliente = {
    from: (_t: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: "m-1", user_id: ALVO, revoked_at: null },
              error: null,
            }),
          }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  };
  const admin = {
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { id: ALVO, user_metadata: meta } },
          error: null,
        }),
        updateUserById: async (_id: string, args: { user_metadata: Record<string, unknown> }) => {
          escritas.push(args.user_metadata);
          return { data: {}, error: null };
        },
      },
    },
  };
  return {
    cliente: cliente as never,
    admin: admin as never,
    escritas,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao("admin");
});

describe("PATCH nome", () => {
  it("grava o nome e preserva as outras chaves do metadata", async () => {
    const mem = banco({ full_name: "Antônio", outra_chave: "fica" });
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    vi.mocked(createAdminClient).mockReturnValue(mem.admin);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/nome/route");
    const res = await PATCH(req({ nome: "Daniel" }), params);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: { nome: string } };
    expect(corpo.data.nome).toBe("Daniel");
    // Merge, não troca: escrever por cima apagaria o que outro fluxo guardou.
    expect(mem.escritas[0]).toMatchObject({ full_name: "Daniel", outra_chave: "fica" });
    const auditoria = vi.mocked(audit).mock.calls[0]?.[0] as {
      action: string;
      metadata: Record<string, unknown>;
    };
    expect(auditoria.action).toBe("team.nome_changed");
    expect(auditoria.metadata).toMatchObject({ old_nome: "Antônio", new_nome: "Daniel" });
  });

  it("1 letra é 422", async () => {
    const mem = banco({});
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    vi.mocked(createAdminClient).mockReturnValue(mem.admin);
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/nome/route");
    const res = await PATCH(req({ nome: "X" }), params);
    expect(res.status).toBe(422);
    expect(mem.escritas).toHaveLength(0);
  });

  it("não-admin é 403", async () => {
    sessao("agent");
    const { PATCH } = await import("@/app/api/v1/team/[user_id]/nome/route");
    const res = await PATCH(req({ nome: "Daniel" }), params);
    expect(res.status).toBe(403);
  });
});
