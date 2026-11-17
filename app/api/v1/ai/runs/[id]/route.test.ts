import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ID = "11111111-1111-4111-8111-111111111111";

/**
 * GET /api/v1/ai/runs/:id — a trilha do turno (0312).
 *
 * O caso que importa não é o 200: é a linha ANTERIOR à trilha devolver
 * `tem_trilha: false` em vez de um painel vazio, e a execução de outra
 * organização devolver 404 (nunca 403 com existência revelada).
 */
function dbCom(linha: Record<string, unknown> | null) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: linha, error: null });
  return { from: () => q };
}

function pedido(id = ID) {
  return new NextRequest(`http://localhost/api/v1/ai/runs/${id}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u1" },
    org: { orgId: ORG, role: "manager", name: "Org" },
  } as never);
});

describe("GET /api/v1/ai/runs/:id", () => {
  it("devolve a trilha completa quando existe", async () => {
    vi.mocked(createClient).mockResolvedValue(
      dbCom({
        id: ID,
        contact_id: null,
        purpose: "agent_turn",
        provider: "anthropic",
        model: "claude",
        status: "ok",
        error_code: null,
        error_message: null,
        http_status: null,
        origem_da_escolha: "org",
        input_tokens: 10,
        output_tokens: 5,
        cost_cents: 2,
        latency_ms: 900,
        created_at: "2026-11-17T10:00:00Z",
        prompt_system: "Você é o atendente.",
        prompt_messages: [{ role: "user", content: "oi" }],
        output_text: "Olá!",
        tool_calls: [{ tool: "buscar_conhecimento", input: "{}" }],
        sources: null,
      }) as never,
    );

    const { GET } = await import("./route");
    const res = await GET(pedido(), { params: Promise.resolve({ id: ID }) });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: { output_text: string; prompt_messages: unknown; tem_trilha: boolean };
    };
    expect(corpo.data.output_text).toBe("Olá!");
    expect(corpo.data.prompt_messages).toEqual([{ role: "user", content: "oi" }]);
    expect(corpo.data.tem_trilha).toBe(true);
  });

  it("linha anterior à 0312: 200 com tem_trilha=false (não inventa vazio)", async () => {
    vi.mocked(createClient).mockResolvedValue(
      dbCom({
        id: ID,
        contact_id: null,
        purpose: "agent_turn",
        provider: "anthropic",
        model: "claude",
        status: "ok",
        error_code: null,
        error_message: null,
        http_status: null,
        origem_da_escolha: null,
        input_tokens: 1,
        output_tokens: 1,
        cost_cents: 0,
        latency_ms: 100,
        created_at: "2026-01-01T00:00:00Z",
        prompt_system: null,
        prompt_messages: null,
        output_text: null,
        tool_calls: null,
        sources: null,
      }) as never,
    );

    const { GET } = await import("./route");
    const res = await GET(pedido(), { params: Promise.resolve({ id: ID }) });
    const corpo = (await res.json()) as { data: { tem_trilha: boolean; output_text: null } };
    expect(res.status).toBe(200);
    expect(corpo.data.tem_trilha).toBe(false);
    expect(corpo.data.output_text).toBeNull();
  });

  it("execução inexistente (ou de outra org) é 404", async () => {
    vi.mocked(createClient).mockResolvedValue(dbCom(null) as never);
    const { GET } = await import("./route");
    const res = await GET(pedido(), { params: Promise.resolve({ id: ID }) });
    expect(res.status).toBe(404);
  });

  it("id fora do formato é 400 e não consulta o banco", async () => {
    const { GET } = await import("./route");
    const res = await GET(pedido("nao-e-uuid"), { params: Promise.resolve({ id: "nao-e-uuid" }) });
    expect(res.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("viewer é barrado antes de qualquer leitura", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden_role", "Requer role >= manager.", 403, {}),
    } as never);
    const { GET } = await import("./route");
    const res = await GET(pedido(), { params: Promise.resolve({ id: ID }) });
    expect(res.status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
  });
});
