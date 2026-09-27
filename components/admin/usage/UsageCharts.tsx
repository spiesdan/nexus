"use client";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { UsageSeries } from "@/app/api/v1/admin/usage/route";
// DÓLAR: o número é `llm_calls.cost_cents`, e `pricing.ts` cota o provedor em USD.
import { formatCentsUSD } from "@/lib/money";
import { useT } from "@/hooks/i18n/useT";
import {
  ChartCard,
  ChartEmpty,
  CORES_DA_SERIE,
  chartTooltipStyle,
  eixoComum,
  formatNumero,
  formatTickDia,
  formatTokens,
  gridComum,
  margemDoChart,
} from "@/components/nexus-ui/charts/nexus-chart";

interface UsageChartsProps {
  series: UsageSeries;
}

export function UsageCharts({ series }: UsageChartsProps) {
  const tagDoIdioma = useTagDeIdioma();
  const t = useT();
  const hasMessages = series.messages.some((p) => p.count > 0);
  const hasCost = series.ai_cost.some((p) => p.cents > 0);
  const hasTokens = series.ai_tokens.some((p) => p.tokens > 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Messages per day */}
      <ChartCard title={t("Mensagens / dia")}>
        {!hasMessages ? (
          <ChartEmpty />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={series.messages}
              margin={margemDoChart}
            >
              <defs>
                <linearGradient id="colorMsg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridComum} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatTickDia(v, tagDoIdioma)}
                {...eixoComum}
                interval="preserveStartEnd"
              />
              <YAxis
                {...eixoComum}
                tickFormatter={formatNumero}
                width={45}
              />
              <Tooltip
                formatter={(value) => [formatNumero(Number(value)), t("Mensagens")]}
                labelFormatter={(label) => formatTickDia(String(label), tagDoIdioma)}
                contentStyle={chartTooltipStyle}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                fill="url(#colorMsg)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* AI Cost per day */}
      <ChartCard title={t("Custo AI / dia (R$)")}>
        {!hasCost ? (
          <ChartEmpty />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={series.ai_cost}
              margin={margemDoChart}
            >
              <defs>
                <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2,142 76% 36%))" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(var(--chart-2,142 76% 36%))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridComum} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatTickDia(v, tagDoIdioma)}
                {...eixoComum}
                interval="preserveStartEnd"
              />
              <YAxis
                {...eixoComum}
                tickFormatter={(v: number) =>
                  formatCentsUSD(v)
                }
                width={70}
              />
              <Tooltip
                formatter={(value) => [formatCentsUSD(Number(value)), t("Custo")]}
                labelFormatter={(label) => formatTickDia(String(label), tagDoIdioma)}
                contentStyle={chartTooltipStyle}
              />
              <Area
                type="monotone"
                dataKey="cents"
                stroke={CORES_DA_SERIE.custo}
                strokeWidth={2}
                fill="url(#colorCost)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* AI Tokens per day — full width */}
      <div className="md:col-span-2">
        <ChartCard title={t("AI Tokens / dia")}>
          {!hasTokens ? (
            <ChartEmpty />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={series.ai_tokens}
                margin={margemDoChart}
              >
                <defs>
                  <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-3,262 83% 58%))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--chart-3,262 83% 58%))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridComum} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => formatTickDia(v, tagDoIdioma)}
                  {...eixoComum}
                  interval="preserveStartEnd"
                />
                <YAxis
                  {...eixoComum}
                  tickFormatter={formatTokens}
                  width={50}
                />
                <Tooltip
                  formatter={(value) => [formatNumero(Number(value)), "Tokens"]}
                  labelFormatter={(label) => formatTickDia(String(label), tagDoIdioma)}
                  contentStyle={chartTooltipStyle}
                />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke={CORES_DA_SERIE.tokens}
                  strokeWidth={2}
                  fill="url(#colorTokens)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
