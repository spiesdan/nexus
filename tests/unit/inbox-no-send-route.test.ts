/**
 * POST /api/v1/conversations/[id]/no-send — o gesto humano do opt-out.
 *
 * ─── O QUE SE MEDE AQUI, E O QUE SE MEDE EM OUTRO LUGAR ───────────────────
 *
 * Aqui: o contrato da rota — quem pode (agent+), o estado da conversa que
 * bloqueia o gesto, a entrega do sem envio (mesmo write do opt-out de palavra)
 * e os dois lados de auditoria (audit `contact.blocked` + timeline `contact_no_send`).
 *
 * Em outro lugar: a PARTE DECISÓRIA do motor — `lib/opt-out/deteccao.ts` (a
 * palavra) e `lib/agent-engine/guardrails/before-send.ts` (a parada irrevogável).
 * Esta suíte não re-testa o motor; testa a porta que converte a decisão humana em
 * estado.
 */
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { registrarTrocaDeComando } from "@/lib/inbox/atividade-de-comando";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/inbox/atividade-de-comando", () => ({ registrarTrocaDeComando: vi.fn(async () => {}) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const CONVERSA_ID = "33333333-3333-4333-8333-333333333333";
const CONTACT_ID = "44444444-4444-4444-8444-444444444444";

const CONVERSA = {
  id: CONVERSA_ID,
  organization_id: ORG,
  contact_id: CONTACT_ID,
  status: "open",
  assigned_to_user_id: null,
  last_inbound_at: null,
  last_message_at: null,
  last_message_preview: null,
  unread_count_for_assignee: 0,
  created_at: "2026-11-10T12:00:00Z",
  updated_at: "2026-11-10T12:00:00Z",
};

const CONTATO = {
  id: CONTACT_ID,
  is_blocked: true,
  blocked_reason: "manual",
  blocked_at: "2026-11-10T20:00:00Z",
};

function sessao(papel: Role) {
  const user: AuthUser = {
    id: ANA,
    email: "ana@example.com",
    full_name: "Ana",
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: papel }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: new NextResponse("forbidden", { status: 403 }) },
  );
}

function cadeiaConversa(dados: { data: unknown; error: unknown }) {
  const maybeSingle = () => Promise.resolve(dados);
  const eq = () => ({ eq: () => ({ maybeSingle }) });
  const select = () => ({ eq });
  const from = (tabela: string) => {
    if (tabela !== "conversations") return { select: () => ({}) } as never;
    return { select };
  };
  return { from };
}



beforeEach(() => {
  vi.clearAllMocks();
  sessao("agent");
});

describe("POST /api/v1/conversations/[id]/no-send", () => {
  it("agent marca o contato como sem envio: grava o opt-out e audita", async () => {
    const updateContato = vi.fn(() => ({
      eq: () => ({
        eq: () => ({
          select: () => ({ single: () => Promise.resolve({ data: CONTATO, error: null }) }),
        }),
      }),
    }));
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({ update: updateContato }),
    } as never);
    vi.mocked(createClient).mockImplementation(
      async () =>
        ({
          from: (tabela: string) => cadeiaConversa({ data: CONVERSA, error: null }).from(tabela),
        }) as never,
    );

    const { POST } = await import("@/app/api/v1/conversations/[id]/no-send/route");
    const res = await POST(new NextRequest(`http://localhost/api/v1/conversations/${CONVERSA_ID}/no-send`, {
      method: "POST",
    }), { params: Promise.resolve({ id: CONVERSA_ID }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { no_send: boolean } };
    expect(body.data.no_send).toBe(true);

    // O write é o MESMO do opt-out de palavra: flag dura + motivo manual.
    expect(updateContato).toHaveBeenCalledWith({
      is_blocked: true,
      blocked_reason: "manual",
      blocked_at: expect.any(String),
    });

    // Auditoria: `contact.blocked` — o vocabulário que já existe para o opt-out.
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "contact.blocked", resourceType: "contact" }),
    );

    // Timeline: a linha do comando que mudou.
    expect(registrarTrocaDeComando).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "contact_no_send" }),
    );
  });

  it("conversation fechada → 409 (não há comando a pausar/marcar)", async () => {
    vi.mocked(createClient).mockImplementation(
      async () =>
        ({
          from: (tabela: string) =>
            cadeiaConversa({
              data: { ...CONVERSA, status: "closed" },
              error: null,
            }).from(tabela),
        }) as never,
    );

    const { POST } = await import("@/app/api/v1/conversations/[id]/no-send/route");
    const res = await POST(new NextRequest(`http://localhost/api/v1/conversations/${CONVERSA_ID}/no-send`, {
      method: "POST",
    }), { params: Promise.resolve({ id: CONVERSA_ID }) });

    expect(res.status).toBe(409);
  });

  it("conversation sem contato vinculado → 404", async () => {
    vi.mocked(createClient).mockImplementation(
      async () =>
        ({
          from: (tabela: string) =>
            cadeiaConversa({
              data: { ...CONVERSA, contact_id: null },
              error: null,
            }).from(tabela),
        }) as never,
    );

    const { POST } = await import("@/app/api/v1/conversations/[id]/no-send/route");
    const res = await POST(new NextRequest(`http://localhost/api/v1/conversations/${CONVERSA_ID}/no-send`, {
      method: "POST",
    }), { params: Promise.resolve({ id: CONVERSA_ID }) });

    expect(res.status).toBe(404);
  });

  it("conversation inexistente → 404", async () => {
    vi.mocked(createClient).mockImplementation(
      async () =>
        ({
          from: (tabela: string) => cadeiaConversa({ data: null, error: null }).from(tabela),
        }) as never,
    );

    const { POST } = await import("@/app/api/v1/conversations/[id]/no-send/route");
    const res = await POST(new NextRequest(`http://localhost/api/v1/conversations/${CONVERSA_ID}/no-send`, {
      method: "POST",
    }), { params: Promise.resolve({ id: CONVERSA_ID }) });

    expect(res.status).toBe(404);
  });

  it("sem permissão (viewer) → 403 e nada é gravado", async () => {
    sessao("viewer");

    const { POST } = await import("@/app/api/v1/conversations/[id]/no-send/route");
    const res = await POST(new NextRequest(`http://localhost/api/v1/conversations/${CONVERSA_ID}/no-send`, {
      method: "POST",
    }), { params: Promise.resolve({ id: CONVERSA_ID }) });

    expect(res.status).toBe(403);
    expect(vi.mocked(createAdminClient)).not.toHaveBeenCalled();
  });
});
