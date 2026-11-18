import { describe, expect, it } from "vitest";

import { payloadDeReenvio, podeReenviar } from "@/lib/inbox/reenvio";
import type { Message } from "@/lib/types/messaging";

function mensagem(over: Partial<Message>): Message {
  return {
    id: "m-1",
    organization_id: "org-1",
    conversation_id: "conv-1",
    channel_session_id: "sess-1",
    contact_id: "contato-1",
    external_id: null,
    type: "text",
    direction: "outbound",
    status: "failed",
    ack: null,
    error_code: "send_failed",
    error_message: "Falha no canal",
    body: "Bom dia!",
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: "user",
    sent_by_user_id: null,
    sent_at: "2026-11-18T12:00:00.000Z",
    delivered_at: null,
    read_at: null,
    metadata: {},
    edited_at: null,
    revoked_at: null,
    reply_to_message_id: null,
    created_at: "2026-11-18T12:00:00.000Z",
    ...over,
  };
}

describe("podeReenviar", () => {
  it("aceita texto outbound que falhou", () => {
    expect(podeReenviar(mensagem({}))).toBe(true);
  });

  it("recusa inbound: reenviar inverteria o remetente", () => {
    expect(podeReenviar(mensagem({ direction: "inbound" }))).toBe(false);
  });

  it("recusa quem NÃO falhou — queued/sending ainda têm dono", () => {
    for (const status of ["queued", "sending", "sent", "delivered", "read"]) {
      expect(podeReenviar(mensagem({ status }))).toBe(false);
    }
  });

  it("recusa mensagem apagada para todos", () => {
    expect(podeReenviar(mensagem({ revoked_at: "2026-11-18T12:01:00.000Z" }))).toBe(false);
  });

  it("recusa template: os valores do modelo não estão na linha", () => {
    expect(podeReenviar(mensagem({ type: "template", body: null }))).toBe(false);
  });

  it("aceita mídia sem texto", () => {
    expect(
      podeReenviar(mensagem({ type: "image", body: null, media_storage_path: "org/conv/foto.jpg" })),
    ).toBe(true);
  });

  it("recusa texto vazio sem mídia — não há o que reenviar", () => {
    expect(podeReenviar(mensagem({ body: "   " }))).toBe(false);
  });

  it("cartão de contato exige o contato no metadata", () => {
    expect(podeReenviar(mensagem({ type: "contact", body: null }))).toBe(false);
    expect(
      podeReenviar(
        mensagem({
          type: "contact",
          body: null,
          metadata: { shared_contact_id: "outro-contato" },
        }),
      ),
    ).toBe(true);
  });
});

describe("payloadDeReenvio", () => {
  it("leva conteúdo e citação, sem metadata de OUTRO envio", () => {
    const payload = payloadDeReenvio(
      mensagem({
        body: "Segue o orçamento",
        reply_to_message_id: "m-0",
        metadata: { queued_reason: "channel_not_working", ai_actor_id: "agente-1" },
      }),
    );
    expect(payload).toEqual({
      type: "text",
      body: "Segue o orçamento",
      reply_to_message_id: "m-0",
    });
  });

  it("leva as colunas de mídia", () => {
    const payload = payloadDeReenvio(
      mensagem({
        type: "document",
        body: null,
        media_storage_path: "org/conv/nota.pdf",
        media_mime: "application/pdf",
        media_size_bytes: 1024,
      }),
    );
    expect(payload).toEqual({
      type: "document",
      media_storage_path: "org/conv/nota.pdf",
      media_mime: "application/pdf",
      media_size_bytes: 1024,
    });
  });

  it("reconstrói o cartão de contato a partir do metadata", () => {
    const payload = payloadDeReenvio(
      mensagem({
        type: "contact",
        body: null,
        metadata: { shared_contact: { name: "Maria", phone_number: "+5547999990000" } },
      }),
    );
    expect(payload).toEqual({
      type: "contact",
      metadata: { shared_contact: { name: "Maria", phone_number: "+5547999990000" } },
    });
  });

  it("devolve null quando a mensagem não é reenviável", () => {
    expect(payloadDeReenvio(mensagem({ status: "sent" }))).toBeNull();
  });
});
