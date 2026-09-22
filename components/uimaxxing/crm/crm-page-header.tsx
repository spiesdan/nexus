"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de página no idioma visual UImaxxing (FASE 6/7).
 *
 * Estrutura ADAPTada do `settings-panel`/`asset-header`: eyebrow em caixa
 * alta + título tight + descrição muted + slot de ações. Usa tokens
 * semânticos do produto (bg/card/text) para funcionar nos dois temas —
 * os showcases UImaxxing assumem superfícies escuras, e este produto é
 * light-first (ver `app/globals.css`).
 */
export function CrmPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
