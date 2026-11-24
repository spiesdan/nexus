/** Regras puras do webhook Stripe — testáveis sem rede nem banco. */

export type StatusFatura = "paid" | "open" | "unpaid" | "action_required" | "void" | "draft";

/** Evento mais antigo que um já aplicado NÃO pode reaplicar estado antigo. */
export function eventoEstaAtrasado(criadoEm: Date | null, ultimoAplicadoEm: Date | null): boolean {
  if (!ultimoAplicadoEm) return false;
  if (!criadoEm || Number.isNaN(criadoEm.getTime())) return true;
  return criadoEm.getTime() <= ultimoAplicadoEm.getTime();
}

export function statusDaFatura(tipo: string): StatusFatura | null {
  switch (tipo) {
    case "invoice.paid": return "paid";
    case "invoice.payment_failed": return "unpaid";
    case "invoice.payment_action_required": return "action_required";
    case "invoice.voided": return "void";
    default: return null;
  }
}

/**
 * Suspensão SÓ com fatura vencida e sem pagamento. Sem tolerância: a regra é
 * no vencimento. Organização sem fatura nunca entra aqui.
 */
export function deveSuspender(status: StatusFatura, vencimento: Date | null, agora: Date): boolean {
  if (status === "paid" || status === "void" || status === "draft") return false;
  if (!vencimento || Number.isNaN(vencimento.getTime())) return false;
  return vencimento.getTime() <= agora.getTime();
}

export function faturaPaga(status: StatusFatura): boolean {
  return status === "paid";
}
