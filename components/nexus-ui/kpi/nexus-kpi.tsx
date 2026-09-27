"use client";

import type { ElementType } from "react";
import { CaretDownIcon, CaretUpIcon, MinusIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

/**
 * Métrica no padrão §11 do prompt (label/value/variation/trend/comparison/period)
 * — o card de KPI único do produto, criado sobre o `CrmKpi` (o único que já
 * estava em tela) para absorver as 4 variantes que existiam:
 *
 *   - `CrmKpi`/`CrmKpiGrid` (home e financeiro) → a base; markup intacto;
 *   - `KPICard` do dashboard admin → `icon` no canto + `tone` de semáforo
 *     (accent/danger) e `hint` = o antigo subtitle;
 *   - `StatCard` de AI usage e AI evolution → `hint`/`significa`;
 *   - `StatCard` do TenantOverview → `value` number (formatado pt-BR aqui) +
 *     `tone="warning"` (borda âmbar) + `icon` Warning com aria-label.
 *
 * Copy de cada tela passa INTEGRA pelas props; o que mudou é o rótulo do campo,
 * não o texto na tela. Número vira string aqui — quem já formata (moeda, %)
 * continua formatando antes de chamar.
 */
export type NexusKpiTrend = "up" | "down" | "flat";
export type NexusKpiTone = "default" | "accent" | "warning" | "danger";

export function NexusKpi({
  label,
  value,
  hint,
  variation,
  trend = "flat",
  comparison,
  period,
  icon: Icon,
  iconLabel,
  tone = "default",
}: {
  label: string;
  value: string | number;
  /** Terceiro texto (o "subtitle"/"significa"/"hint" das variantes antigas). */
  hint?: string;
  variation?: string;
  trend?: NexusKpiTrend;
  comparison?: string;
  period?: string;
  icon?: ElementType;
  /** Sem ele o ícone é decorativo (aria-hidden); com ele vira acessível. */
  iconLabel?: string;
  tone?: NexusKpiTone;
}) {
  const Seta = trend === "up" ? CaretUpIcon : trend === "down" ? CaretDownIcon : MinusIcon;
  const texto = typeof value === "number" ? value.toLocaleString("pt-BR") : value;
  const temLinhaDeBaixo = variation !== undefined || comparison !== undefined || period !== undefined;

  return (
    <div
      className={cn(
        "hover-raise rounded-card border border-border bg-card p-5",
        tone === "warning" && "border-warning/40 bg-warning-bg",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground",
              tone === "accent" && "text-amber-600",
              tone === "danger" && "text-red-600",
            )}
          >
            {texto}
          </p>
        </div>
        {Icon ? (
          <Icon
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0",
              tone === "danger" && "text-red-500",
              tone === "accent" && "text-amber-500",
              tone === "warning" && "text-warning-fg",
              tone === "default" && "text-muted-foreground",
            )}
            aria-hidden={iconLabel ? undefined : true}
            aria-label={iconLabel}
          />
        ) : null}
      </div>
      {hint ? (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
      {temLinhaDeBaixo ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {variation ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-semibold tabular-nums",
                trend === "up" && "text-positive",
                trend === "down" && "text-negative",
                trend === "flat" && "text-muted-foreground",
              )}
            >
              <Seta className="size-3" weight="bold" aria-hidden />
              {variation}
            </span>
          ) : null}
          {comparison ? <span className="text-muted-foreground">{comparison}</span> : null}
          {period ? <span className="text-muted-foreground">· {period}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function NexusKpiGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
