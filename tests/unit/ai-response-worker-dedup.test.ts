/**
 * Idempotência de retry do worker legado (`persistAndDispatch`).
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══════════════════════════════════════════
 *
 * O drain re-entrega o job após erro/crash, e o LLM roda DE NOVO antes de
 * chegar na persistência. Sem âncora, cada retry inseria UMA outbound nova
 * (`sending` órfã — `message.send_requested` nunca teve consumidor — + custo
 * LLM dobrado). A âncora é o inbound que originou a resposta, gravado em
 * `metadata.inbound_message_id` e checado antes do insert.
 *
 * O arnês é o de `ai-response-worker-sent-via.test.ts` (caminho inteiro até
 * `persistAndDispatch`, threshold 0 para G3 não desviar), com UMA diferença:
 * o `maybeSingle` de `messages` distingue a checagem de dedup (filtro de
 * metadata) das demais leituras.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock: Record<string, string> = {
  ANTHROPIC_API_KEY: "sk-ant-teste",
  AI_GATEWAY_API_KEY: "",
  AI_GATEWAY_BASE_URL: "",
  OPENROUTER_API_KEY: "",
  OPENROUTER_BASE_URL: "",
  OPENAI_API_KEY: "",
};
vi.mock("@/lib/env", () => ({
  get env() {
    return envMock;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { processMessageReceived } from "@/workers/ai-response-worker";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventRow } from "@/lib/event-log/dispatcher";

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const CONV_ID = "44444444-4444-4444-8444-444444444444";
const MSG_ID = "55555555-5555-4555-8555-555555555555";
const CONTACT_ID = "66666666-6666-4666-8666-666666666666";
const SESSION_ID = "77777777-7777-4777-8777-777777777777";
const AGENT_ID = "88888888-8888-4888-8888-888888888888";
const OUTBOUND_NOVO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTBOUND_EXISTENTE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const INBOUND_BODY = "bom dia, qual o prazo de entrega?";

interface LinhaInserida {
  table: string;
  row: Record<string, unknown>;
}

/** `jaRespondido` controla o que a checagem de dedup encontra. */
function makeAdminStub(jaRespondido: boolean) {
  const inserted: LinhaInserida[] = [];

  const from = (table: string) => {
    const single: Record<string, unknown> | null =
      table === "conversations"
        ? {
            id: CONV_ID,
            organization_id: ORG_ID,
            contact_id: CONTACT_ID,
            channel_session_id: SESSION_ID,
            last_inbound_at: new Date().toISOString(),
            bot_silenced_until: null,
            last_handoff_at: null,
            assignee_kind: "ai",
            contacts: {
              id: CONTACT_ID,
              display_name: null,
              locale: "pt-BR",
              is_blocked: false,
              force_human: false,
            },
          }
        : table === "messages"
          ? { id: MSG_ID, body: INBOUND_BODY, direction: "inbound", organization_id: ORG_ID }
          : table === "ai_agents"
            ? {
                id: AGENT_ID,
                organization_id: ORG_ID,
                model: "anthropic/claude-sonnet-4-6",
                system_prompt: "Você é um atendente.",
                config: { confidence_threshold: 0 },
                guardrails: {},
                active_kb_version_id: null,
                is_active: true,
                is_default: true,
                kind: "rag_bot",
                published_version_id: null,
                archived_at: null,
              }
            : null;

    let consultaDePublicado = false;
    let consultaDeDedup = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const terminais: any = {
      maybeSingle: () => {
        if (consultaDeDedup) {
          return Promise.resolve({
            data: jaRespondido ? { id: OUTBOUND_EXISTENTE } : null,
            error: null,
          });
        }
        return Promise.resolve({ data: consultaDePublicado ? null : single, error: null });
      },
      single: () => Promise.resolve({ data: single, error: null }),
      insert: (row: Record<string, unknown>) => {
        inserted.push({ table, row });
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: OUTBOUND_NOVO }, error: null }),
          }),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(resolve),
        };
      },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data:
            table === "messages"
              ? [
                  {
                    id: MSG_ID,
                    body: INBOUND_BODY,
                    direction: "inbound",
                    created_at: new Date().toISOString(),
                  },
                ]
              : table === "ai_agents"
                ? (single ? [single] : [])
                : [],
          error: null,
        }).then(resolve),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = new Proxy(terminais, {
      get: (alvo, prop) =>
        prop in alvo
          ? alvo[prop as keyof typeof alvo]
          : (...args: unknown[]) => {
              if (prop === "not" && args[0] === "published_version_id") consultaDePublicado = true;
              if (prop === "eq" && args[0] === "metadata->>inbound_message_id") {
                consultaDeDedup = true;
              }
              return chain;
            },
    });
    return chain;
  };

  const rpc = () => Promise.resolve({ data: [], error: null });

  return { stub: { from, rpc }, inserted };
}

const eventRow = {
  organization_id: ORG_ID,
  entity_id: MSG_ID,
  payload: { message_id: MSG_ID, conversation_id: CONV_ID },
} as unknown as EventRow;

let fetchOriginal: typeof globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        id: "msg_stub",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-6",
        content: [{ type: "text", text: "Nosso prazo é de 3 dias úteis." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 8 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

function outboundInseridas(inserted: LinhaInserida[]): Record<string, unknown>[] {
  return inserted
    .filter((i) => i.table === "messages" && i.row["direction"] === "outbound")
    .map((i) => i.row);
}

describe("ai-response-worker — retry não duplica a outbound", () => {
  it("sem resposta anterior: insere UMA outbound com a âncora do inbound", async () => {
    const { stub, inserted } = makeAdminStub(false);
    vi.mocked(createAdminClient).mockReturnValue(
      stub as unknown as ReturnType<typeof createAdminClient>,
    );
    const result = await processMessageReceived(eventRow);

    const outbound = outboundInseridas(inserted);
    expect(outbound.length).toBe(1);
    expect((outbound[0]!["metadata"] as Record<string, unknown>)["inbound_message_id"]).toBe(
      MSG_ID,
    );
    expect(result.status).toBe("sent_to_dispatch");
    expect(result.outbound_message_id).toBe(OUTBOUND_NOVO);
  });

  it("com resposta anterior (retry): reaproveita, sem insert novo", async () => {
    const { stub, inserted } = makeAdminStub(true);
    vi.mocked(createAdminClient).mockReturnValue(
      stub as unknown as ReturnType<typeof createAdminClient>,
    );
    const result = await processMessageReceived(eventRow);

    expect(outboundInseridas(inserted).length).toBe(0);
    expect(result.status).toBe("sent_to_dispatch");
    expect(result.outbound_message_id).toBe(OUTBOUND_EXISTENTE);
  });
});
