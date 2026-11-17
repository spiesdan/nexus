/**
 * `platform_admins.scope` era lido e NUNCA comparado.
 *
 * O banco declara dois valores — `full` e `support_readonly`
 * (`platform_admins_scope_check`, baseline.sql:1791) —, o guard lia a coluna e
 * devolvia no contexto, e nenhuma rota olhava para ela. Um administrador de
 * plataforma criado para dar suporte somente-leitura podia suspender tenant,
 * criar tenant e impersonar como se fosse `full`.
 *
 * O teste é sobre a PORTA: com escopo de leitura, a rota responde 403 e não
 * chega a abrir o cliente service-role.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import type * as RequirePlatformAdmin from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

import { POST } from "./route";

vi.mock("@/lib/auth/requirePlatformAdmin", async (importOriginal) => {
  const real = await importOriginal<typeof RequirePlatformAdmin>();
  return { ...real, requirePlatformAdmin: vi.fn() };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const TENANT = "33333333-3333-4333-8333-333333333333";

function ctx(scope: "full" | "support_readonly") {
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: "99999999-9999-4999-8999-999999999999" },
    platformAdmin: { user_id: "u", scope, mfa_required: true },
  } as never);
}

function pedido() {
  return new NextRequest(`http://localhost/api/v1/admin/tenants/${TENANT}/suspend`, {
    method: "POST",
    body: JSON.stringify({ reason: "inadimplência há três meses" }),
    headers: { "content-type": "application/json" },
  });
}

const params = { params: Promise.resolve({ id: TENANT }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /admin/tenants/[id]/suspend — escopo da plataforma", () => {
  it("support_readonly NÃO suspende — e nem abre o service role", async () => {
    ctx("support_readonly");

    const res = await POST(pedido(), params);

    expect(res.status).toBe(403);
    const corpo = (await res.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe("forbidden_scope");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("full chega ao banco (a recusa do teste é o tenant inexistente, não o escopo)", async () => {
    ctx("full");
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => {
        const b = { select: () => b, eq: () => b, maybeSingle };
        return b;
      },
    } as never);

    const res = await POST(pedido(), params);

    // Sem tenant, 404 — o importante é que o guard de escopo não barrou.
    expect(res.status).toBe(404);
    expect(maybeSingle).toHaveBeenCalled();
  });
});
