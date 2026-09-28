import type { ReactNode } from "react";

/**
 * Cabeçalho de página Nexus: título + descrição + ações contextuais + slot
 * opcional de navegação (breadcrumb / tabs). Identidade única, sem reaprender.
 *
 * Absorveu o antigo `components/layout/PageHeader` (Fase 5a) — o markup interno
 * é o mesmo dele: no mobile empilha (título em cima, ações embaixo); a ação
 * principal é o primeiro filho de `actions` com variant default; as demais são
 * secundárias.
 *
 * `headingLevel` existe para cabeçalho EMBUTIDO (painel dentro de página que
 * já tem o seu): um `h1` por página, e o nível desce sem mudar o visual.
 */
export function NexusPageHeader({
  title,
  subtitle,
  actions,
  navigation,
  headingLevel = 1,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  navigation?: ReactNode;
  headingLevel?: 1 | 2;
}) {
  const Titulo = headingLevel === 2 ? "h2" : "h1";
  return (
    <div className="space-y-3">
      {navigation ? <div className="text-sm text-muted-foreground">{navigation}</div> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Titulo className="text-2xl font-medium tracking-tight text-text">{title}</Titulo>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
