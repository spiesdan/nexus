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

/**
 * O QUADRO DO CARTÃO — a caixa que o valor e o esqueleto têm de compartilhar.
 *
 * O esqueleto de carregamento era feito à mão em cada tela, com `Skeleton h-24`
 * dentro de `grid-cols-2`: 204 px no celular contra os **490 px** do
 * `NexusKpiGrid` de verdade (medido em 16/11/2026 em `/app/financeiro`). A tela
 * pulava 286 px quando o número chegava — CLS 0,128, acima do limite de 0,1.
 * Reservar espaço com a mesma caixa e as mesmas três linhas de texto é o que
 * faz o número entrar onde o buraco já estava.
 */
const QUADRO_DO_KPI = "rounded-card border border-border bg-card p-5";

/**
 * AS TRÊS LINHAS DO CARTÃO — as mesmas no valor e no esqueleto.
 *
 * Altura de linha vem da fonte e do `line-height` herdado; cravar `h-5`/`h-8`
 * no esqueleto deu 3 px de erro por cartão (medido: 102 px contra 99 px), e o
 * erro cresce se a fonte ou o `line-height` mudar. Compartilhar a classe é o que
 * faz a caixa bater por construção — inclusive no dia em que alguém mexer no
 * tamanho do texto.
 */
const TEXTO_DO_ROTULO = "text-[11px] font-semibold uppercase tracking-[0.12em]";
const TEXTO_DO_VALOR = "mt-2 text-2xl font-semibold tabular-nums tracking-tight";
const TEXTO_DO_RODAPE = "mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs";

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
        "hover-raise",
        QUADRO_DO_KPI,
        tone === "warning" && "border-warning/40 bg-warning-bg",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn(TEXTO_DO_ROTULO, "text-muted-foreground")}>{label}</p>
          <p
            className={cn(
              TEXTO_DO_VALOR,
              "text-foreground",
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
        <div className={TEXTO_DO_RODAPE}>
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

/**
 * O CARTÃO DE KPI ENQUANTO O NÚMERO NÃO CHEGOU.
 *
 * Não é enfeite: é reserva de espaço. O esqueleto antigo (`Skeleton h-24` num
 * `grid-cols-2`) media 204 px no celular e o cartão real 490 px — a tela pulava
 * 286 px e o CLS de `/app/financeiro` ia a **0,128**, acima do limite de 0,1 do
 * Core Web Vitals (medido em 16/11/2026, CPU 4× e rede de 1,6 Mbps).
 *
 * Duas decisões, e as duas são sobre não voltar a divergir:
 *
 *   1. o grid é o `NexusKpiGrid` de verdade — mesma largura de coluna, mesmo
 *      ponto de quebra. `grid-cols-2 / lg:grid-cols-4` do esqueleto não é o
 *      grid do produto (`grid-cols-1 / sm:grid-cols-2 / xl:grid-cols-4`);
 *   2. a caixa e as linhas vêm das MESMAS classes do cartão com número
 *      (`QUADRO_DO_KPI`, `TEXTO_DO_ROTULO`, `TEXTO_DO_VALOR`,
 *      `TEXTO_DO_RODAPE`). O texto é transparente: a altura da linha é a de
 *      uma fonte de verdade, não de um retângulo que tenta adivinhá-la.
 *
 * Gate em `tests/unit/kpi-skeleton-espelha-o-grid.test.ts`.
 */
export function NexusKpiSkeleton({
  /** O cartão real tem a linha de comparação/variação no rodapé. */
  comRodape = false,
  className,
}: {
  comRodape?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(QUADRO_DO_KPI, "animate-pulse", className)} aria-hidden>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn(TEXTO_DO_ROTULO, "text-muted-foreground")}>
            <span className="block h-3 w-20 rounded-md bg-primary/10" />
          </p>
          <p className={cn(TEXTO_DO_VALOR, "text-foreground")}>
            <span className="block h-7 w-24 rounded-md bg-primary/10" />
          </p>
          {comRodape ? (
            <div className={TEXTO_DO_RODAPE}>
              <span className="block h-3 w-16 rounded-md bg-primary/10" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
