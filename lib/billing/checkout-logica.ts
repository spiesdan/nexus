/**
 * Antes de cobrar, olhar o que já existe.
 *
 * O Stripe cria duas assinaturas para o mesmo cliente sem avisar. Quem
 * descobre é o cliente, no extrato. Toda decisão do checkout é pura aqui.
 */
import { createHash } from "node:crypto";

/** Status em que abrir outro checkout significaria cobrar duas vezes. */
export const STATUS_VIVO = new Set(["active", "trialing", "past_due"]);

export interface AssinaturaLocal {
  status: string;
}

export type DecisaoCheckout =
  | { pode: true; customerId: string | null; idempotencyKey: string }
  | { pode: false; motivo: string };

export function deveBloquear(status: string | null | undefined): boolean {
  return Boolean(status && STATUS_VIVO.has(status.toLowerCase()));
}

/**
 * Duplo clique: mesma org + mesmo Price + mesma janela curta => MESMA chave,
 * e o Stripe devolve a mesma sessão. Janela curta evita bloquear um segundo
 * checkout legítimo horas depois.
 */
export function chaveIdempotencia(
  organizationId: string,
  priceId: string,
  agoraMs: number,
  janelaMs = 60_000,
): string {
  const bucket = Math.floor(agoraMs / janelaMs);
  return createHash("sha256").update(`${organizationId}|${priceId}|${bucket}`, "utf8").digest("hex");
}

export function decidirCheckout({
  assinaturas,
  customerId,
  organizationId,
  priceId,
  agoraMs,
}: {
  assinaturas: readonly AssinaturaLocal[];
  customerId: string | null | undefined;
  organizationId: string;
  priceId: string;
  agoraMs?: number;
}): DecisaoCheckout {
  const viva = assinaturas.find((a) => deveBloquear(a.status));
  if (viva) {
    return {
      pode: false,
      motivo: "Sua assinatura já está ativa; use o portal para alterar a forma de pagamento.",
    };
  }
  return {
    pode: true,
    customerId: customerId ?? null,
    idempotencyKey: chaveIdempotencia(organizationId, priceId, agoraMs ?? Date.now()),
  };
}
