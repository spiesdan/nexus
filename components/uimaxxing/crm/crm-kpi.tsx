"use client";

import { CaretDownIcon, CaretUpIcon, MinusIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

/**
 * Métricas no padrão §11 do prompt (label/value/variation/trend/comparison/period).
 *
 * Visual ADAPTado do `counter-progress-ring` + `markets-table` stats: número
 * tabular, variação com seta, período em muted. Sem dados demo — tudo via props.
 */
export type CrmTrend = "up" | "down" | "flat";

export function CrmKpi({
  label,
  value,
  variation,
  trend = "flat",
  comparison,
  period,
}: {
  label: string;
  value: string;
  variation?: string;
  trend?: CrmTrend;
  comparison?: string;
  period?: string;
}) {
  const Icon = trend === "up" ? CaretUpIcon : trend === "down" ? CaretDownIcon : MinusIcon;
  return (
    <div className="hover-raise rounded-card border border-border bg-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
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
            <Icon className="size-3" weight="bold" aria-hidden />
            {variation}
          </span>
        ) : null}
        {comparison ? <span className="text-muted-foreground">{comparison}</span> : null}
        {period ? <span className="text-muted-foreground">· {period}</span> : null}
      </div>
    </div>
  );
}

export function CrmKpiGrid({
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
