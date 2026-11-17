/**
 * Tenant SUSPENSO não é impersonável.
 *
 * A rota só recusava `status = 'redacted'`. Suspensão — muitas vezes por
 * inadimplência ou abuso — continuava impersonável: o administrador de
 * plataforma reabria a sessão que a suspensão existia para fechar. O suporte
 * que precisa diagnosticar reativa (com motivo e audit) e então entra.
 *
 * O teste prova a porta: com o tenant suspenso a rota responde 409 e NÃO emite
 * cookie de impersonação.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import type * as RequirePlatformAdmin from "@/lib/auth/requirePlatformAdmin";
import type * as CookieDeImpersonacao from "@/lib/impersonate/cookie";
import { createAdminClient } from "@/lib/supabase/admin";

import { POST } from "./route";

vi.mock("@/lib/auth/requirePlatformAdmin", async (importOriginal) => {
  const real = await importOriginal<typeof RequirePlatformAdmin>();
  return { ...real, requirePlatformAdmin: vi.fn() };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
const { setCookie } = vi.hoisted(() => ({ setCookie: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ set: setCookie })) }));
vi.mock("@/lib/impersonate/cookie", async (importOriginal) => {
  const real = await importOriginal<typeof CookieDeImpersonacao>();
  return {
    ...real,
    isImpersonateSecretReady: () => true,
    signImpersonateCookie: () => "cookie-assinado",
  };
});

const TENANT = "33333333-3333-4333-8333-333333333333";
const params = { params: Promise.resolve({ id: TENANT }) };

function orgCom(status: string) {
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: "99999999-9999-4999-8999-999999999999" },
    platformAdmin: { user_id: "u", scope: "full", mfa_required: true },
  } as never);
  vi.mocked(createAdminClient).mockReturnValue({
    from: () => {
      const b = {
        select: () => b,
        eq: () => b,
        insert: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({
          data: { id: TENANT, slug: "loja", display_name: "Loja", status },
          error: null,
        }),
        then: (resolve: (v: { data: null; error: null }) => unknown) =>
          resolve({ data: null, error: null }),
      };
      return b;
    },
  } as never);
}

function pedido() {
  return new NextRequest(`http://localhost/api/v1/admin/tenants/${TENANT}/impersonate`, {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /admin/tenants/[id]/impersonate", () => {
  it("tenant suspenso responde 409 e não emite cookie", async () => {
    orgCom("suspended");

    const res = await POST(pedido(), params);

    expect(res.status).toBe(409);
    const corpo = (await res.json()) as { error: { code: string; message: string } };
    expect(corpo.error.code).toBe("state_conflict");
    expect(corpo.error.message).toMatch(/suspended/i);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("tenant ativo continua impersonável", async () => {
    orgCom("active");

    const res = await POST(pedido(), params);

    expect(res.status).toBe(200);
    expect(setCookie).toHaveBeenCalledTimes(1);
  });
});
