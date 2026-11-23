import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "o1" }) }),
}));

const rpc = vi.fn(async () => ({ data: true, error: null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

import { resolveActiveOrg } from "@/lib/auth/server";
import type { AuthUser } from "@/lib/auth/types";

function usuario(status: string | null, reason: string | null): AuthUser {
  return {
    id: "u1",
    email: "u@t.test",
    is_platform_admin: false,
    organizations: [
      {
        organization_id: "o1",
        organization_name: "Org",
        role: "admin",
        locale: null,
        status,
        suspended_reason: reason,
      },
    ],
  } as unknown as AuthUser;
}

describe("resolveActiveOrg — gate de cobrança", () => {
  beforeEach(() => {
    rpc.mockClear();
    rpc.mockResolvedValue({ data: true, error: null });
    delete process.env.BILLING_GATE_ENABLED;
  });

  it("org saudável NÃO paga RPC (custo por request)", async () => {
    const org = await resolveActiveOrg(usuario("active", null));
    expect(org?.orgId).toBe("o1");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("suspensa por billing + RPC confirma → null (fecha rotas sem requireRole)", async () => {
    const org = await resolveActiveOrg(usuario("suspended", "billing"));
    expect(org).toBeNull();
    expect(rpc).toHaveBeenCalledWith("fn_billing_gate_bloqueia", { p_org: "o1" });
  });

  it("suspensa por OUTRO motivo não consulta a RPC de billing", async () => {
    const org = await resolveActiveOrg(usuario("suspended", "manual"));
    expect(org?.orgId).toBe("o1");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("kill-switch desligado não consulta e não bloqueia", async () => {
    process.env.BILLING_GATE_ENABLED = "false";
    const org = await resolveActiveOrg(usuario("suspended", "billing"));
    expect(org?.orgId).toBe("o1");
    expect(rpc).not.toHaveBeenCalled();
    delete process.env.BILLING_GATE_ENABLED;
  });
});
