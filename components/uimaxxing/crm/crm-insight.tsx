"use client";

import { ArrowUpRightIcon, SparkleIcon } from "@phosphor-icons/react/ssr";

/**
 * Card de AI Insight ADAPTado do `insight-card` UImaxxing.
 *
 * O showcase é dark-only (texto `text-fg` sobre `bg-surface`); aqui a
 * estrutura (sheen + glow + pill de ação) foi preservada e as cores vêm
 * dos tokens do produto, então funciona no light-first. Conteúdo 100% via
 * props — nenhum texto demo ("Meshing…") sobrevive.
 */
export function CrmInsightCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="hover-raise relative w-full overflow-hidden rounded-card border border-border bg-card p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-foreground/[0.04] via-transparent to-transparent"
      />
      <div aria-hidden className="animate-drift pointer-events-none absolute inset-0">
        <div className="absolute inset-x-6 -bottom-10 h-20 rounded-full bg-accent-blue/20 blur-2xl" />
        <div className="absolute -bottom-8 -right-4 size-24 rounded-full bg-accent-indigo/20 blur-2xl" />
      </div>

      <p className="relative flex items-start gap-2 text-sm leading-6">
        <SparkleIcon className="mt-1 size-4 shrink-0 text-accent-violet" aria-hidden />
        <span>
          <span className="font-semibold text-foreground">{title} </span>
          <span className="text-muted-foreground">{body}</span>
        </span>
      </p>

      {actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="interactive relative mt-4 inline-flex h-9 items-center gap-1.5 rounded-pill bg-foreground px-4 text-[13px] font-semibold text-background hover:opacity-90"
        >
          {actionLabel}
          <ArrowUpRightIcon className="size-3.5" weight="bold" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
