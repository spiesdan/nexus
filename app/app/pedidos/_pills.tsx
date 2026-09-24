"use client";

import { AnimatedBadge, type AnimatedBadgeStatus } from "@/components/motion/animated-badge";
import { ROTULO_DO_STATUS, type StatusDoPedido } from "@/lib/schemas/pedidos";

/**
 * Pills de status no molde do Mercos (Em orçamento amarelo, Concluído verde…)
 * com o invólucro animado do beUI (`animated-badge`, sem ícone para manter a
 * cara da pill original). "use client" por causa do motion.
 */
const STATUS_DO_BADGE: Record<StatusDoPedido, AnimatedBadgeStatus> = {
  rascunho: "warning",
  em_analise: "info",
  aprovado: "info",
  faturado: "neutral",
  expedido: "info",
  entregue: "success",
  cancelado: "neutral",
};

/** Rótulo da pill: rascunho aparece como "Em orçamento", como no Mercos. */
export function rotuloDaPill(status: StatusDoPedido): string {
  if (status === "rascunho") return "Em orçamento";
  if (status === "entregue") return "Concluído";
  return ROTULO_DO_STATUS[status] ?? status;
}

export function PillDoStatus({ status }: { status: StatusDoPedido }) {
  return (
    <AnimatedBadge status={STATUS_DO_BADGE[status] ?? "neutral"} size="sm" showIcon={false}>
      {rotuloDaPill(status)}
    </AnimatedBadge>
  );
}
