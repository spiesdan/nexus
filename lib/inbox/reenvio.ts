/**
 * QUANDO UMA MENSAGEM FALHA E PODE SER REENVIADA — a decisão, um lugar só.
 *
 * A auditoria 5.4 mediu o buraco: a bolha de falha mostra o motivo e não oferece
 * saída. O atendente lê "Falhou", copia o texto para o celular e o histórico do
 * CRM passa a mentir sobre o que o cliente recebeu. Reenviar é retry, não uma
 * capacidade nova: o pedido original já existia.
 *
 * O que ESTA função recusa e por quê:
 *
 *  - `inbound`  — não somos o remetente; reenviar inverteria a conversa.
 *  - `!== failed` — `queued`/`sending` ainda têm dono (o motor reagenda). O
 *    botão ali disputaria com a retentativa e poderia duplicar a mensagem.
 *  - `revoked_at` — o autor apagou para todos: reenviar ressuscitaria o que ele
 *    pediu para tirar do ar.
 *  - `template` — os valores do modelo não são persistidos na linha (só nome e
 *    idioma), então um reenvio sairia com slots vazios. O caminho honesto é o
 *    composer, que tem os valores; aqui não há como prometer o mesmo conteúdo.
 */
import type { Message } from "@/lib/types/messaging";

type MensagemReenviável = Pick<
  Message,
  | "direction"
  | "status"
  | "type"
  | "body"
  | "media_url"
  | "media_storage_path"
  | "revoked_at"
  | "metadata"
>;

/** O que o POST /api/v1/messages precisa para repetir o envio. */
export interface PayloadDeReenvio {
  type: string;
  body?: string;
  media_url?: string;
  media_storage_path?: string;
  media_mime?: string;
  media_size_bytes?: number;
  reply_to_message_id?: string;
  metadata?: Record<string, unknown>;
}

function cartaoDeContato(metadata: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!metadata) return null;
  const id = metadata.shared_contact_id;
  if (typeof id === "string" && id.length > 0) return { shared_contact_id: id };
  const contato = metadata.shared_contact;
  if (contato && typeof contato === "object" && !Array.isArray(contato)) {
    return { shared_contact: contato };
  }
  return null;
}

export function podeReenviar(m: MensagemReenviável): boolean {
  if (m.direction !== "outbound") return false;
  if (m.status !== "failed") return false;
  if (m.revoked_at) return false;
  if (m.type === "template") return false;
  if (m.type === "contact") return cartaoDeContato(m.metadata) !== null;
  return Boolean(m.body?.trim() || m.media_url || m.media_storage_path);
}

/**
 * O corpo do reenvio — derivado da LINHA, não do que está no composer.
 *
 * `metadata` é repassado só no cartão de contato. Reenviar o metadata inteiro
 * carregaria `queued_reason`, `ai_actor_id` e marcas de template de um envio
 * anterior para uma mensagem nova — estados de OUTRO envio. O cartão é a única
 * exceção porque é o próprio conteúdo (`shared_contact_id`).
 */
export function payloadDeReenvio(m: Message): PayloadDeReenvio | null {
  if (!podeReenviar(m)) return null;

  const payload: PayloadDeReenvio = { type: m.type };
  if (m.body && m.body.trim() !== "") payload.body = m.body;
  if (m.media_url) payload.media_url = m.media_url;
  if (m.media_storage_path) payload.media_storage_path = m.media_storage_path;
  if (m.media_mime) payload.media_mime = m.media_mime;
  if (m.media_size_bytes !== null) payload.media_size_bytes = m.media_size_bytes;
  if (m.reply_to_message_id) payload.reply_to_message_id = m.reply_to_message_id;

  if (m.type === "contact") {
    const contato = cartaoDeContato(m.metadata);
    if (contato) payload.metadata = contato;
  }

  return payload;
}
