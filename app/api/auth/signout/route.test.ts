/**
 * A SAÍDA — a rota que os formulários já chamavam e não existia.
 *
 * Medido em 17/11/2026: `AppShell` e `accept-invite` postam em
 * `/api/auth/signout`; a rota dava 404 e o botão “Sair” não saía.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

import { POST } from "./route";

const { deletarCookie } = vi.hoisted(() => ({ deletarCookie: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ delete: deletarCookie })),
}));

function cliente(user: { id: string } | null) {
  const signOut = vi.fn(async () => ({ error: null }));
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user } })), signOut },
  } as never);
  return signOut;
}

function requisicao() {
  return new NextRequest("http://localhost/api/auth/signout", {
    method: "POST",
    headers: { "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/signout", () => {
  it("encerra a sessão, apaga a org ativa e volta para /login", async () => {
    const signOut = cliente({ id: "u1" });

    const res = await POST(requisicao());

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(deletarCookie).toHaveBeenCalledWith("active_org");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/login");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.logout", actorUserId: "u1" }),
    );
  });

  it("sem sessão, ainda limpa os cookies e não audita", async () => {
    const signOut = cliente(null);

    const res = await POST(requisicao());

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(deletarCookie).toHaveBeenCalledWith("active_org");
    expect(res.status).toBe(303);
    expect(audit).not.toHaveBeenCalled();
  });
});
