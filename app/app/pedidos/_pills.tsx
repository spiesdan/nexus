import { Badge } from "@/components/ui/badge";
import { Globe } from "@/lib/ui/icons";
import { ROTULO_DO_STATUS, type StatusDoPedido } from "@/lib/schemas/pedidos";

/**
 * Pills de status no molde do Mercos (Em orçamento amarelo, Concluído verde…).
 * Puro e partilhável entre lista e detalhe — sem "use client".
 *
 * As cores saem das variantes semânticas do `Badge` (tokens dos dois temas),
 * não de hex/escala fixa: as classes `bg-*-100` anteriores lavavam no tema
 * escuro. O mapeamento preserva a convenção Mercos por status.
 */
const VARIANTE_DO_STATUS: Record<StatusDoPedido, "amber" | "warning" | "sky" | "magenta" | "info" | "success" | "mint" | "neutral"> = {
  rascunho: "amber",
  em_analise: "warning",
  aprovado: "sky",
  faturado: "magenta",
  concluido: "success",
  expedido: "info",
  entregue: "mint",
  cancelado: "neutral",
};

/** Rótulo da pill — vem do vocabulário único (`ROTULO_DO_STATUS`). */
export function rotuloDaPill(status: StatusDoPedido): string {
  return ROTULO_DO_STATUS[status] ?? status;
}

export function PillDoStatus({ status }: { status: StatusDoPedido }) {
  return <Badge variant={VARIANTE_DO_STATUS[status] ?? "neutral"}>{rotuloDaPill(status)}</Badge>;
}

/**
 * SELO DE ORIGEM — diz DE ONDE veio, não QUAL É o número (que já está na
 * linha). Só aparece quando `numero_mercos` existe: pedido local não ganha
 * selo de ERP. Ícone é decorativo; "(Mercos)" carrega o significado.
 */
export function SeloMercos({ numeroMercos }: { numeroMercos?: number | null }) {
  if (numeroMercos == null) return null;
  return (
    <span className="inline-flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
      <Globe size={12} aria-hidden />
      (Mercos)
    </span>
  );
}
