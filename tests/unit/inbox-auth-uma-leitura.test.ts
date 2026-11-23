import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn(async () => ({ data: { user: { id: "u-1" } }, error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/auth/server", () => ({
  mfaEmDivida: vi.fn(async () => false),
  loadAuthUser: vi.fn(async () => ({ id: "u-1", email: "u@x.test" })),
  resolveActiveOrg: vi.fn(async () => ({ orgId: "org-1", role: "agent" })),
}));
vi.mock("@/app/api/v1/conversations/_handler", () => ({
  listConversationsHandler: vi.fn(async () => ({ conversations: [], cursor: null, has_more: false })),
}));

describe("GET /api/v1/conversations — autenticação", () => {
  beforeEach(() => vi.clearAllMocks());

  it("faz UMA leitura de usuário (loadAuthUser), nunca o getUser duplicado da rota", async () => {
    const { GET } = await import("@/app/api/v1/conversations/route");
    const res = await GET(new NextRequest("http://x/api/v1/conversations"));
    expect(res.status).toBe(200);
    expect(getUser).not.toHaveBeenCalled();
    // O client é criado, mas a rota não pergunta ao GoTrue por cima do AuthUser.
  });
});
