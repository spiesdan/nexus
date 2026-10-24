/**
 * O QUE A META QUER DIZER COM `statuses[]` — e o que disso vira linha em
 * `messages`.
 *
 * O webhook já RECEBIA `sent`/`delivered`/`read`/`failed` desde a Fase 3b, mas a
 * rota gravava `status: e.status === "failed" ? "failed" : "sent"`. O efeito era
 * medido na tela: a campanha no canal oficial dizia "enviada" para sempre, e
 * `delivered_at`/`read_at` — colunas que o ingest do outro canal preenche — nunca
 * eram tocadas. O CRM não tinha como distinguir "saiu" de "chegou".
 *
 * Este módulo é PURO de propósito: a decisão (que coluna muda, e de quais
 * estados a transição é permitida) fica testável sem banco, e a rota só aplica.
 *
 * ─── Por que a transição é MONOTÔNICA ───────────────────────────────────────
 * A Meta não garante ordem de entrega dos webhooks, e ela REENTREGA o que não
 * recebe 2xx. Um `sent` atrasado chegando depois de um `read` regrediria a linha
 * e apagaria a leitura já registrada. Cada transição declara de quais estados
 * ela pode partir; o `update` da rota usa essa lista no `in("status", …)`.
 *
 * Status desconhecido devolve `null` e a rota o IGNORA com log — a Meta
 * acrescenta estado sem avisar, e um valor novo não pode virar escrita errada.
 */

/** O vocabulário medido na Cloud API. A coluna `messages.status` é `text`. */
export const STATUS_DE_ENTREGA = ["sent", "delivered", "read", "failed"] as const;
export type StatusDeEntrega = (typeof STATUS_DE_ENTREGA)[number];

export interface PatchDeStatus {
  /** Colunas a gravar. Sempre inclui `status` e `updated_at`. */
  patch: Record<string, unknown>;
  /** Estados ATUAIS de onde esta transição é permitida. */
  de: readonly string[];
}

/** Estados em que uma mensagem nossa pode estar antes do primeiro status. */
const ANTES_DE_SAIR = ["queued", "sending"] as const;
/** Já saiu, mas o canal ainda não confirmou a entrega. */
const JA_SAIU = [...ANTES_DE_SAIR, "sent"] as const;
/** Confirmada a entrega (ou já lida). */
const JA_ENTREGUE = [...JA_SAIU, "delivered"] as const;

/**
 * A transição que o evento representa, ou `null` se o status não é nosso.
 *
 * `error_code`/`error_message` só são gravados em `failed` — em `delivered` e
 * `read` a Meta manda `errors: []`, e sobrescrever apagaria o motivo de uma
 * falha anterior que o operador ainda precisa ver.
 */
export function patchDeStatus(
  status: string,
  erro: { code: number | null; title: string | null },
  agoraIso: string,
): PatchDeStatus | null {
  switch (status) {
    case "sent":
      return { patch: { status, updated_at: agoraIso }, de: [...ANTES_DE_SAIR] };
    case "delivered":
      return {
        patch: { status, delivered_at: agoraIso, updated_at: agoraIso },
        de: [...JA_SAIU],
      };
    case "read":
      return { patch: { status, read_at: agoraIso, updated_at: agoraIso }, de: [...JA_ENTREGUE] };
    case "failed":
      return {
        patch: {
          status,
          error_code: erro.code === null ? null : String(erro.code),
          error_message: erro.title,
          updated_at: agoraIso,
        },
        de: [...JA_ENTREGUE],
      };
    default:
      return null;
  }
}
