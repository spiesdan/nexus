/**
 * O ensaio em conversa: histórico do teste até o modelo.
 *
 * ─── O QUE ESTÁ EM JOGO ══════════════════════════════════════════════════
 *
 * O TestPanel manda os turnos anteriores em `historico` a cada envio, e o
 * runtime usa como passado do ensaio. Três lugares para errar em silêncio:
 *
 * 1. O papel trocado no mapeamento (`assistente`→`user`): o agente leria as
 *    próprias falas como se fossem do cliente e concordaria consigo mesmo —
 *    e o teste aprovaria.
 * 2. O schema aceitando lixo: turno sem texto, papel inventado, conversa de
 *    200 turnos estourando a janela sem dizer por quê.
 * 3. A rota não repassando: o painel manda, o runtime nunca recebe, e cada
 *    envio vira um primeiro contato — o teste mente sobre memória.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { mapearHistoricoDeEnsaio } from "@/lib/ai/runtime/agent";
import { testRunSchema } from "@/lib/ai/agents/validation";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const AGENT = "33333333-3333-4333-8333-333333333333";
const VERSION = "44444444-4444-4444-8444-444444444444";

const runAgentMock = vi.hoisted(() =>
  vi.fn(async () => ({
    run_id: "run-1",
    status: "completed",
    final_text: "ok",
  })),
);
vi.mock("@/lib/ai/runtime/agent", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ai/runtime/agent")>();
  return { ...original, runAgent: runAgentMock };
});

function sessaoAdmin() {
  const user: AuthUser = {
    id: USER,
    email: "a@example.com",
    full_name: null,
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: "admin" }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK["admin"] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: "admin" } }
      : ({ ok: false, response: null }) as never,
  );
  vi.mocked(createAdminClient).mockReturnValue({
    from: (tabela: string) => {
      if (tabela === "ai_agent_versions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: VERSION,
                      agent_id: AGENT,
                      organization_id: ORG,
                      system_prompt: "oi",
                      provider: "google",
                      model: "gemini-3.6-flash",
                      channel_session_id: null,
                      max_steps: 3,
                      token_budget: 1000,
                      cost_budget_cents: 100,
                      tool_ids: [],
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        insert: () => ({
          select: () => ({ single: async () => ({ data: { id: "run-1" }, error: null }) }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  } as never);
}

function post(corpo: unknown) {
  return new NextRequest(
    `http://x/api/v1/ai/agents/${AGENT}/versions/${VERSION}/test`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessaoAdmin();
});

describe("mapearHistoricoDeEnsaio", () => {
  it("user vira user, assistente vira assistant, ordem preservada", () => {
    expect(
      mapearHistoricoDeEnsaio([
        { papel: "user", texto: "oi" },
        { papel: "assistente", texto: "olá, em que ajudo?" },
        { papel: "user", texto: "quanto custa?" },
      ]),
    ).toEqual([
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá, em que ajudo?" },
      { role: "user", content: "quanto custa?" },
    ]);
  });

  it("MUTAÇÃO: papel trocado faz o agente ler a própria fala como do cliente", () => {
    // Se `assistente` mapeasse para `user`, o prompt teria duas falas do
    // "cliente" seguidas — e o teste aprovaria uma conversa onde o agente
    // concorda consigo mesmo.
    const saida = mapearHistoricoDeEnsaio([{ papel: "assistente", texto: "x" }]);
    expect(saida[0]!.role).toBe("assistant");
    expect(saida[0]!.role).not.toBe("user");
  });

  it("vazio vira vazio — primeiro turno não tem passado", () => {
    expect(mapearHistoricoDeEnsaio([])).toEqual([]);
  });
});

describe("testRunSchema — historico", () => {
  it("aceita conversa com turnos alternados", () => {
    const r = testRunSchema.safeParse({
      sample_message: "e o prazo?",
      historico: [
        { papel: "user", texto: "oi" },
        { papel: "assistente", texto: "olá!" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("ausente continua válido — um turno só não precisa de passado", () => {
    expect(testRunSchema.safeParse({ sample_message: "oi" }).success).toBe(true);
  });

  it("papel inventado é recusado", () => {
    const r = testRunSchema.safeParse({
      sample_message: "oi",
      historico: [{ papel: "sistema", texto: "x" }],
    });
    expect(r.success).toBe(false);
  });

  it("turno vazio é recusado — turno sem texto não é turno", () => {
    const r = testRunSchema.safeParse({
      sample_message: "oi",
      historico: [{ papel: "user", texto: "   " }],
    });
    expect(r.success).toBe(false);
  });

  it("mais de 20 turnos é recusado — sem teto estoura a janela em silêncio", () => {
    const historico = Array.from({ length: 21 }, (_, i) => ({
      papel: i % 2 === 0 ? ("user" as const) : ("assistente" as const),
      texto: "x",
    }));
    const r = testRunSchema.safeParse({ sample_message: "oi", historico });
    expect(r.success).toBe(false);
  });
});

describe("POST .../versions/:vid/test — repasse do historico", () => {
  it("chega ao runAgent dentro de override.historico", async () => {
    const { POST } = await import(
      "@/app/api/v1/ai/agents/[id]/versions/[vid]/test/route"
    );
    const historico = [
      { papel: "user", texto: "oi" },
      { papel: "assistente", texto: "olá!" },
    ];
    const res = await POST(post({ sample_message: "e o prazo?", historico }), {
      params: Promise.resolve({ id: AGENT, vid: VERSION }),
    });
    expect(res.status).toBe(200);
    expect(runAgentMock).toHaveBeenCalledOnce();
    const primeiraChamada = runAgentMock.mock.calls[0] as unknown as [
      { override?: { historico?: unknown } },
    ];
    expect(primeiraChamada[0]?.override?.historico).toEqual(historico);
  });

  it("sem historico, o override vai sem ele — primeiro turno", async () => {
    const { POST } = await import(
      "@/app/api/v1/ai/agents/[id]/versions/[vid]/test/route"
    );
    const res = await POST(post({ sample_message: "oi" }), {
      params: Promise.resolve({ id: AGENT, vid: VERSION }),
    });
    expect(res.status).toBe(200);
    const primeiraChamada = runAgentMock.mock.calls[0] as unknown as [
      { override?: { historico?: unknown } },
    ];
    expect(primeiraChamada[0]?.override?.historico).toBeUndefined();
  });

  it("historico inválido é 422 antes de tocar no runtime", async () => {
    const { POST } = await import(
      "@/app/api/v1/ai/agents/[id]/versions/[vid]/test/route"
    );
    const res = await POST(
      post({ sample_message: "oi", historico: [{ papel: "sistema", texto: "x" }] }),
      { params: Promise.resolve({ id: AGENT, vid: VERSION }) },
    );
    expect(res.status).toBe(422);
    expect(runAgentMock).not.toHaveBeenCalled();
  });
});
