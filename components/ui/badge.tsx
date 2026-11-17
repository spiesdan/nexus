import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge — Visitors design system (DESIGN.md).
 * Pill em tudo (assinatura). Variants: default (accent soft), neutral,
 * success, warning, error, info + tons categoria (mint/sky/amber/magenta/
 * ember, pontuação funcional em tags curtas — nunca texto corrido, ver
 * globals.css). Compat aliases: secondary -> neutral, destructive -> error,
 * outline -> neutral.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 rounded-full border px-3 py-0.5",
    "text-xs font-medium leading-5 tracking-[-0.02em]",
    "transition-colors duration-fast ease-out",
    "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-accent-soft text-accent",
        neutral:
          "border-border bg-surface-elevated text-text-muted",
        success:
          "border-transparent bg-success-bg text-success-fg",
        warning:
          "border-transparent bg-warning-bg text-warning-fg",
        error:
          "border-transparent bg-error-bg text-error-fg",
        info:
          "border-transparent bg-info-bg text-info-fg",
        mint:
          // `bg-mint-wash text-mint` era #33c758 sobre #def6e4 = **1,95:1**,
          // e `--color-mint-wash` não mudava no escuro. Medido em 16/11/2026 no
          // selo "Entregue" da lista de pedidos.
          //
          // O wash passou a ser temado (verde com alfa no escuro) e o TEXTO
          // usa `--color-success-fg`, que já é o token de texto verde por tema:
          // 5,6:1 no claro e 7,4:1 no escuro. A paleta `mint` continua valendo
          // para gráfico e ilustração, onde não é texto sobre fundo próprio.
          "border-transparent bg-mint-wash text-success-fg",
        sky:
          "border-border bg-surface text-sky-fg",
        amber:
          "border-border bg-surface text-amber-fg",
        magenta:
          // `text-magenta` (#d6409f) sobre `surface` dá 4,13:1 no claro e
          // 4,43:1 no escuro — reprova AA para 12 px, o tamanho do selo.
          // "Faturado" da lista de pedidos era o caso medido (17/11/2026).
          "border-border bg-surface text-magenta-fg",
        ember:
          "border-border bg-surface text-ember-fg",
        // shadcn aliases
        secondary:
          "border-border bg-surface-elevated text-text-muted",
        destructive:
          "border-transparent bg-error-bg text-error-fg",
        outline:
          "border-border bg-transparent text-text",
        // UImaxxing aliases (registry `badge.json`): os showcases usam
        // `positive`/`negative`/`solid` — mapeados para os semânticos do
        // produto em vez de duplicar o componente (§33).
        positive:
          "border-transparent bg-success-bg text-success-fg",
        negative:
          "border-transparent bg-error-bg text-error-fg",
        solid:
          "border-transparent bg-accent text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
