"use client";

import { ArcSpinner } from "@/components/uimaxxing/arc-spinner";
import { DotRingLoader } from "@/components/uimaxxing/dot-ring-loader";
import { LinearProgress } from "@/components/uimaxxing/linear-progress";
import { Button } from "@/components/ui/button";

/**
 * Estados de interface exigidos pela regra de qualidade §42, servidos pelos
 * loaders UImaxxing reais (USE direto — §7):
 * loading → `arc-spinner` / `dot-ring-loader`, progresso → `linear-progress`.
 * Empty/error seguem o mesmo chrome de card para não criar segundo sistema.
 */
export function CrmLoading({
  label = "Carregando…",
  variant = "spinner",
}: {
  label?: string;
  variant?: "spinner" | "dots";
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground"
    >
      {variant === "dots" ? <DotRingLoader /> : <ArcSpinner />}
      <span>{label}</span>
    </div>
  );
}

export function CrmEmpty({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-card px-6 py-12 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {actionLabel ? (
        <Button type="button" onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function CrmError({
  title = "Algo deu errado",
  description = "Tente novamente. Se persistir, fale com o suporte.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-card border border-negative/30 bg-negative-bg px-6 py-12 text-center"
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry} className="mt-2">
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function CrmProgress({ label }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label ?? "Progresso"}>
      <LinearProgress />
      {label ? (
        <p className="mt-1 text-center text-xs text-muted-foreground">{label}</p>
      ) : null}
    </div>
  );
}
