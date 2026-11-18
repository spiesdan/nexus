/**
 * Isolamento no ENVIO — o caminho que passa por service role.
 *
 * `sendMessageHandler` é chamado com dois clients diferentes:
 *
 *   1. o do usuário (`createClient()`), em que a RLS resolve a organização;
 *   2. o de **service role**, que BYPASSA RLS — MCP (`lib/mcp/server.ts` e
 *      `lib/mcp/auth.ts` usam `createAdminClient()`), agent-engine e follow-ups.
 *
 * No segundo caso, a única coisa entre o `conversation_id` recebido e a conversa
 * de outro tenant é o próprio handler conferir `conv.organization_id`. Ele não
 * conferia: a busca é `.eq("id", input.conversation_id).maybeSingle()` e o resto
 * do caminho usa `c.organization_id` para escrever (mensagem, conversa,
 * contato). O resultado medido com estes dois testes, antes da correção, era
 * uma mensagem inserida na conversa da organização B por um ctx da organização
 * A — com o telefone do cliente de B como destinatário.
 *
 * O MCP torna isso alcançável de fora: `crm_send_whatsapp_message` aceita
 * `conversation_id` do corpo da tool, autentica por token de organização e
 * entrega o admin client ao handler. Um token da org A com o id da conversa da
 * org B enviava para o cliente de B.
 *
 * Os dois casos aqui são o par que impede correção cosmética: o cross-organização
 * precisa ser recusado E a própria organização precisa continuar enviando.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import type { SendMessageInput } from "@/lib/schemas";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const CONV = "33333333-3333-4333-8333-333333333333";
const CONTACT = "44444444-4444-4444-8444-444444444444";
const SESSION = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;

function conversa(orgDaConversa: string): Row {
  return {
    id: CONV,
    organization_id: orgDaConversa,
    contact_id: CONTACT,
    channel_session_id: SESSION,
    is_group: false,
    group_chat_id: null,
    bot_silenced_until: null,
    provider_conversation_id: null,
    contacts: { phone_number: "+5531999998888", wa_identity: null, wa_lid: null, is_blocked: false },
    channel_sessions: {
      provider: "waha",
      waha_session_name: "default",
      status: "WORKING",
      archived_at: null,
    },
  };
}

/** Client mínimo; conta INSERT em `messages` — é o efeito que não pode existir. */
function clientFalso(linhaDaConversa: Row) {
  const enviados: Row[] = [];
  const client = {
    from(tabela: string) {
      if (tabela === "conversations") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: linhaDaConversa, error: null }) }) }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (tabela === "messages") {
        return {
          insert: (linha: Row) => {
            enviados.push(linha);
            return {
              select: () => ({
                single: async () => ({
                  data: { id: "msg-1", external_id: null, ack: null, error_code: null, error_message: null, ...linha },
                  error: null,
                }),
              }),
            };
          },
          update: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
        };
      }
      return { update: () => cadeiaUpdate() };
    },
    rpc: async () => ({ data: null, error: null }),
  };
  return { client: client as unknown as SupabaseClient, enviados };
}

/** Encadeamento tolerante: `.eq()` quantas vezes o handler usar. */
function cadeiaUpdate(): Row {
  const cadeia: Row = {
    eq: () => cadeia,
    select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return cadeia;
}

const ctx: HandlerCtx = {
  organization_id: ORG_A,
  actor: { type: "user", id: "66666666-6666-4666-8666-666666666666" },
  requestId: "req-teste-isolamento",
};

const entrada: SendMessageInput = { conversation_id: CONV, type: "text", body: "olá" };

describe("sendMessageHandler — organização da conversa", () => {
  it("recusa conversa de OUTRA organização e não insere mensagem", async () => {
    const { client, enviados } = clientFalso(conversa(ORG_B));

    await expect(sendMessageHandler(client, ctx, entrada)).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
    expect(enviados, "mensagem cross-tenant foi inserida").toHaveLength(0);
  });

  it("continua enviando na própria organização (controle positivo)", async () => {
    const { client, enviados } = clientFalso(conversa(ORG_A));

    const mensagem = await sendMessageHandler(client, ctx, entrada);

    expect(mensagem.id).toBe("msg-1");
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.organization_id).toBe(ORG_A);
  });
});
