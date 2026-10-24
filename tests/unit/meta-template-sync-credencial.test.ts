/**
 * POST /api/v1/channels/templates — de ONDE vem o token do sync.
 *
 * O defeito que este arquivo prende: a rota lia só `META_SYSTEM_USER_TOKEN` do
 * ambiente. Quem conectava o número pela tela gravava o token cifrado na sessão
 * e mesmo assim via "missing_meta_token" ao sincronizar — a conexão existia,
 * mas o sync falava por uma credencial que não era a dela.
 *
 * A regra é a MESMA do envio: sessão primeiro, ambiente como fallback explícito
 * de instalação de número único. E falha de resolução fecha a ação; nunca cai
 * silenciosamente na conta do ambiente.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { metaCredsFromEnv, resolveMetaCreds } from "@/lib/channels/meta/credentials";
import { metaSessionForOrg } from "@/lib/channels/meta/session";
import { syncTemplates } from "@/lib/channels/meta/template-sync";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/channels/meta/session", () => ({ metaSessionForOrg: vi.fn() }));
vi.mock("@/lib/channels/meta/credentials", () => ({
  metaCredsFromEnv: vi.fn(),
  resolveMetaCreds: vi.fn(),
}));
vi.mock("@/lib/channels/meta/template-sync", () => ({ syncTemplates: vi.fn() }));

const ORG = "11111111-1111-4111-8111-111111111111";
const WABA = "waba-123";
const PHONE = "123456789012345";

function req(): NextRequest {
  return new NextRequest("http://x/api/v1/channels/templates", { method: "POST" });
}

function autorizado() {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "user-1" },
    org: { orgId: ORG, name: "Org", role: "admin" },
  } as never);
}

function sessao(phoneNumberId: string | null = PHONE) {
  vi.mocked(metaSessionForOrg).mockResolvedValue({
    id: "session-1",
    organizationId: ORG,
    wabaId: WABA,
    phoneNumberId,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  autorizado();
  vi.mocked(createAdminClient).mockReturnValue({} as never);
  vi.mocked(syncTemplates).mockResolvedValue({
    inserted: 0,
    updated: 0,
    unchanged: 0,
    disabled: 0,
  });
});

afterEach(() => {
  delete process.env.META_SYSTEM_USER_TOKEN;
});

describe("POST /channels/templates — credencial da sessão, não só do ambiente", () => {
  it("usa o token da SESSÃO quando o número foi conectado pela tela", async () => {
    process.env.META_SYSTEM_USER_TOKEN = "token-do-env";
    sessao();
    vi.mocked(resolveMetaCreds).mockResolvedValue({
      phoneNumberId: PHONE,
      token: "token-da-sessao",
      graphVersion: "v22.0",
      source: "session",
    });

    const { POST } = await import("@/app/api/v1/channels/templates/route");
    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(resolveMetaCreds).toHaveBeenCalledWith(expect.anything(), {
      organizationId: ORG,
      phoneNumberId: PHONE,
    });
    expect(syncTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        wabaId: WABA,
        token: "token-da-sessao",
      }),
    );
  });

  it("sem phone_number_id na sessão, cai no fallback EXPLÍCITO do ambiente", async () => {
    sessao(null);
    vi.mocked(metaCredsFromEnv).mockReturnValue({
      phoneNumberId: "999",
      token: "token-do-env",
      graphVersion: "v22.0",
      source: "env",
    });

    const { POST } = await import("@/app/api/v1/channels/templates/route");
    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(resolveMetaCreds).not.toHaveBeenCalled();
    expect(syncTemplates).toHaveBeenCalledWith(
      expect.objectContaining({ token: "token-do-env" }),
    );
  });

  it("sem credencial nenhuma, devolve missing_meta_token e NÃO sincroniza", async () => {
    sessao(null);
    vi.mocked(metaCredsFromEnv).mockReturnValue(null);

    const { POST } = await import("@/app/api/v1/channels/templates/route");
    const res = await POST(req());

    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("missing_meta_token");
    expect(syncTemplates).not.toHaveBeenCalled();
  });

  it("falha ao resolver a credencial vira erro visível, não fallback silencioso", async () => {
    sessao();
    vi.mocked(resolveMetaCreds).mockRejectedValue(new Error("meta_creds_lookup_failed: PGRST116"));

    const { POST } = await import("@/app/api/v1/channels/templates/route");
    const res = await POST(req());

    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toContain("meta_creds_lookup_failed");
    expect(syncTemplates).not.toHaveBeenCalled();
  });

  it("sem canal oficial, nem tenta resolver credencial", async () => {
    vi.mocked(metaSessionForOrg).mockResolvedValue(null);

    const { POST } = await import("@/app/api/v1/channels/templates/route");
    const res = await POST(req());

    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("no_meta_channel");
    expect(resolveMetaCreds).not.toHaveBeenCalled();
    expect(syncTemplates).not.toHaveBeenCalled();
  });
});
