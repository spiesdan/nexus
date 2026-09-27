"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";

/**
 * Primitivos compartilhados dos gráficos recharts — nasceu da fusão dos 2
 * irmãos byte a byte que existiam (`components/ai/UsageChart.tsx` ×
 * `components/admin/usage/UsageCharts.tsx`): moldura de card, estado vazio,
 * estilo de tooltip, formatadores de eixo e catálogo de cores de série.
 *
 * Cada tela continua montando o próprio chart (LineChart/AreaChart/PieChart…)
 * com o domínio dela — o que sai daqui é o que era literalmente repetido.
 */
export function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

/** Estado vazio padrão dos gráficos (altura = a do `ResponsiveContainer`). */
export function ChartEmpty({ className }: { className?: string }) {
  const t = useT();
  return (
    <div
      className={cn(
        "flex items-center justify-center text-sm text-muted-foreground",
        className ?? "h-[200px]",
      )}
    >
      {t("Sem dados no período")}
    </div>
  );
}

export const chartTooltipStyle = {
  borderRadius: "8px",
  fontSize: "12px",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
};

/** Moldura de eixo/grid repetida em todos os charts irmãos. */
export const eixoComum = {
  tick: { fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridComum = {
  strokeDasharray: "3 3",
  className: "stroke-border/50",
} as const;

export const margemDoChart = { top: 4, right: 8, bottom: 0, left: 0 } as const;

/**
 * Dia `YYYY-MM-DD` → `DD/MM`. O parse é sempre UTC + `timeZone: "UTC"`: a
 * string é só uma data, sem fuso — os dois irmãos antigos faziam um parse
 * local e outro UTC e chegavam ao mesmo rótulo só enquanto a máquina não
 * mudasse de fuso.
 */
export function formatTickDia(dia: string, idioma: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  return d.toLocaleDateString(idioma, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

export function formatNumero(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

/** Cores de série escritas à mão nos irmãos — catálogo único agora. */
export const CORES_DA_SERIE = {
  custo: "hsl(142 76% 36%)",
  tokens: "hsl(262 83% 58%)",
  latenciaComum: "hsl(199 89% 48%)",
  latenciaPior: "hsl(0 84% 60%)",
  handoff: "hsl(38 92% 50%)",
} as const;
