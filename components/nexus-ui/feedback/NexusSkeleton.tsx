"use client";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeletons padronizados (shape-aware). Proibido `<p>Carregando…` — usar
 * estes presets ou `NexusLoading` para espera curta sem forma conhecida.
 */
export function NexusTableSkeleton({
  rows = 6,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  const t = useT();
  return (
    <div
      role="status"
      aria-label={t("Carregando dados")}
      className={cn("space-y-2 rounded-lg border border-border bg-surface p-4", className)}
    >
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function NexusCardsSkeleton({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  const t = useT();
  return (
    <div
      role="status"
      aria-label={t("Carregando dados")}
      className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function NexusPageSkeleton({ className }: { className?: string }) {
  const t = useT();
  return (
    <div role="status" aria-label={t("Carregando página")} className={cn("space-y-4", className)}>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <NexusTableSkeleton />
    </div>
  );
}

/**
 * O CARTÃO QUE SE SABE QUAL É, ANTES DE SABER O CONTEÚDO.
 *
 * `NexusCardSkeleton` existe porque a alternativa — um `<Skeleton className="h-32
 * w-full" />` solto — desenha um retângulo cinza SEM NOME no meio da página. Em
 * Indicadores eram três seguidos: quem abria a tela via três buracos e não
 * sabia se eram funil, atividade ou resumo. Na VPS, com o primeiro render
 * esperando a API, isso é a primeira impressão da tela.
 *
 * O título é o do cartão de verdade, no mesmo `h2` e no mesmo tamanho, então o
 * layout não pula quando o conteúdo chega: só as linhas de baixo trocam.
 */
export function NexusCardSkeleton({
  titulo,
  linhas = 3,
  className,
}: {
  titulo: string;
  linhas?: number;
  className?: string;
}) {
  const t = useT();
  return (
    <section
      role="status"
      aria-label={`${t("Carregando")} ${titulo}`}
      className={cn("rounded-lg border border-border bg-surface p-4 shadow-xs", className)}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-text">{titulo}</h2>
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="mt-3 space-y-2">
        {Array.from({ length: linhas }).map((_, i) => (
          <Skeleton key={i} className={i === 0 ? "h-6 w-3/4" : "h-3 w-full"} />
        ))}
      </div>
    </section>
  );
}
