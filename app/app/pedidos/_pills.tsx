import { Badge } from "@/components/ui/badge";
import { ROTULO_DO_STATUS, type StatusDoPedido } from "@/lib/schemas/pedidos";

/**
 * Pills de status no molde do Mercos (Em orçamento amarelo, Concluído verde…).
 * Puro e partilhável entre lista e detalhe — sem "use client".
 *
 * As cores saem das variantes semânticas do `Badge` (tokens dos dois temas),
 * não de hex/escala fixa: as classes `bg-*-100` anteriores lavavam no tema
 * escuro. O mapeamento preserva a convenção Mercos por status.
 */
const VARIANTE_DO_STATUS: Record<StatusDoPedido, "amber" | "warning" | "sky" | "magenta" | "info" | "success" | "neutral"> = {
  rascunho: "amber",
  em_analise: "warning",
  aprovado: "sky",
  faturado: "magenta",
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
  return <Badge variant={VARIANTE_DO_STATUS[status] ?? "neutral"}>{rotuloDaPill(status)}</Badge>;
}
