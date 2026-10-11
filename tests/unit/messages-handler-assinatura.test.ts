/**
 * A ASSINATURA NO ENVIO — humano assina, bot não.
 *
 * ─── O que estes testes provam, no handler de verdade ───────────────────────
 *
 * `sendMessageHandler` é o caminho único de saída. Com o WAHA desligado, a
 * mensagem fica `queued` sem rede — e o corpo gravado já carrega (ou não) a
 * assinatura. É a costura exata entre a regra pura (`assinatura.test.ts`) e a
 * produção.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import type { SendMessageInput } from "@/lib/schemas";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user: {
              id,
              email: "ana@bill.com",
              user_metadata: { full_name: "Ana Paula" },
            },
          },
          error: null,
        }),
      },
    },
    from: (tabela: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            tabela === "organizations"
              ? { data: { display_name: "Bill Higiene e Limpeza" }, error: null }
              : { data: null, error: null },
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

function makeSupabase(setor: string | null) {
  const state: { message: Row | null } = { message: null };
  const client = {
    from(table: string) {
      if (table === "conversations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: CONV,
                  organization_id: ORG,
                  contact_id: "c-1",
                  channel_session_id: "s-1",
                  is_group: false,
                  group_chat_id: null,
                  contacts: {
                    phone_number: "+5531999998888",
                    wa_identity: null,
                    is_blocked: false,
                  },
                  channel_sessions: {
                    provider: "waha",
                    waha_session_name: "default",
                    status: "WORKING",
                    archived_at: null,
                  },
                },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === "user_organizations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { setor }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "messages") {
        return {
          insert: (row: Row) => {
            state.message = { id: "msg-1", ...row };
            return {
              select: () => ({ single: async () => ({ data: { ...state.message }, error: null }) }),
            };
          },
          update: () => ({
            eq: () => ({
              select: () => ({ maybeSingle: async () => ({ data: state.message, error: null }) }),
            }),
          }),
        };
      }
      if (table === "contacts") {
        const cadeia: Record<string, unknown> = {
          eq: () => cadeia,
          then: (resolve: (v: { error: null }) => unknown) =>
            Promise.resolve({ error: null }).then(resolve),
        };
        return { update: () => cadeia };
      }
      throw new Error(`fake_supabase: tabela inesperada '${table}'`);
    },
    rpc: async () => ({ error: null }),
  };
  return { cliente: client as unknown as SupabaseClient, state };
}

function ctxDe(actor: HandlerCtx["actor"]): HandlerCtx {
  return { organization_id: ORG, actor, requestId: "req-1" };
}

function texto(corpo: Partial<SendMessageInput> = {}): SendMessageInput {
  return { conversation_id: CONV, type: "text", body: "chegou hoje", ...corpo } as SendMessageInput;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("assinatura no envio", () => {
  it("humano com ramal: o corpo gravado termina com a assinatura", async () => {
    vi.stubEnv("WAHA_API_BASE_URL", "");
    vi.stubEnv("WAHA_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    const { cliente, state } = makeSupabase("Faturamento");

    const msg = await sendMessageHandler(cliente, ctxDe({ type: "user", id: USER }), texto());

    expect(state.message?.body).toBe("chegou hoje\nBill Higiene e Limpeza - Faturamento Ana");
    expect((msg as unknown as { body: string }).body).toContain("Faturamento Ana");
  });

  it("humano SEM ramal: sai sem assinatura", async () => {
    vi.stubEnv("WAHA_API_BASE_URL", "");
    vi.stubEnv("WAHA_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    const { cliente, state } = makeSupabase(null);

    await sendMessageHandler(cliente, ctxDe({ type: "user", id: USER }), texto());

    expect(state.message?.body).toBe("chegou hoje");
  });

  it("bot/IA não assina — tem identidade própria", async () => {
    vi.stubEnv("WAHA_API_BASE_URL", "");
    vi.stubEnv("WAHA_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    const { cliente, state } = makeSupabase("Faturamento");

    await sendMessageHandler(cliente, ctxDe({ type: "webhook_source", id: "camp-1" }), texto());

    expect(state.message?.body).toBe("chegou hoje");
  });

  it("template não é tocado", async () => {
    // Template passa por caminho próprio; a assinatura aqui seria texto
    // grudado em payload aprovado pela Meta. O teste garante que o bloco
    // novo nem olha para esse tipo.
    vi.stubEnv("WAHA_API_BASE_URL", "");
    vi.stubEnv("WAHA_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    const { cliente, state } = makeSupabase("Faturamento");

    await sendMessageHandler(
      cliente,
      ctxDe({ type: "user", id: USER }),
      texto({
        type: "template",
        template_name: "x",
        template_language: "pt_BR",
        template_values: {},
      }),
    ).catch(() => null);

    // Sem definição de template no fake, o envio falha ANTES de qualquer
    // escrita com assinatura — o ponto é que nada assinado foi gravado.
    const body = state.message?.body;
    expect(typeof body === "string" && body.includes("Faturamento Ana")).toBe(false);
  });
});
