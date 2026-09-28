"use client";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { UsagePayload } from "@/lib/ai/usage/aggregate";
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

interface Props {
  payload: UsagePayload;
}

export function UsageChart({ payload }: Props) {
  const tagDoIdioma = useTagDeIdioma();
  const t = useT();
  const { series } = payload;

  // Pre-build merged latency dataset for the dual-line chart.
  const latencyData = series.p50_latency_ms.map((p, i) => ({
    day: p.day,
    p50: p.value,
    p95: series.p95_latency_ms[i]?.value ?? 0,
  }));

  const handoffData = series.handoff_rate.map((p) => ({
    day: p.day,
    pct: Number((p.value * 100).toFixed(2)),
  }));

  const hasCost = series.cost_cents.some((p) => p.value > 0);
  const hasTokens = series.total_tokens.some((p) => p.value > 0);
  const hasLatency = latencyData.some((p) => p.p50 > 0 || p.p95 > 0);
  const hasHandoff = handoffData.some((p) => p.pct > 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard title={t("Quanto gastou por dia (R$)")}>
        {!hasCost ? (
          <ChartEmpty />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={series.cost_cents}
              margin={margemDoChart}
            >
              <CartesianGrid {...gridComum} />
              <XAxis
                dataKey="day"
                tickFormatter={(v) => formatTickDia(v, tagDoIdioma)}
                {...eixoComum}
                interval="preserveStartEnd"
              />
              <YAxis
                {...eixoComum}
                tickFormatter={(v: number) => formatCentsUSD(v)}
                width={70}
              />
              <Tooltip
                formatter={(value) => [formatCentsUSD(Number(value)), t("Custo")]}
                labelFormatter={(label) => formatTickDia(String(label), tagDoIdioma)}
                contentStyle={chartTooltipStyle}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={CORES_DA_SERIE.custo}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title={t("Volume de texto processado por dia")}>
        {!hasTokens ? (
          <ChartEmpty />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={series.total_tokens}
              margin={margemDoChart}
            >
              <CartesianGrid {...gridComum} />
              <XAxis
                dataKey="day"
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
                formatter={(value) => [formatNumero(Number(value)), t("Tokens")]}
                labelFormatter={(label) => formatTickDia(String(label), tagDoIdioma)}
                contentStyle={chartTooltipStyle}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={CORES_DA_SERIE.tokens}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title={t("Tempo de resposta por dia (segundos)")}>
        {!hasLatency ? (
          <ChartEmpty />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={latencyData}
              margin={margemDoChart}
            >
              <CartesianGrid {...gridComum} />
              <XAxis
                dataKey="day"
                tickFormatter={(v) => formatTickDia(v, tagDoIdioma)}
                {...eixoComum}
                interval="preserveStartEnd"
              />
              <YAxis
                {...eixoComum}
                // O eixo TAMBÉM em segundos. Traduzir só o título e o tooltip
                // deixaria a régua contradizendo o rótulo — o gráfico diria
                // "segundos" e mostraria 24.000 na lateral.
                tickFormatter={(v: number) =>
                  (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })
                }
                width={40}
              />
              <Tooltip
                // Segundos, não milissegundos: 17.621 ms não diz nada a quem
                // atende; 17,6 s diz.
                formatter={(value, name) => [
                  `${(Number(value) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`,
                  name,
                ]}
                labelFormatter={(label) => formatTickDia(String(label), tagDoIdioma)}
                contentStyle={chartTooltipStyle}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="p50"
                name={t("a maioria responde em")}
                stroke={CORES_DA_SERIE.latenciaComum}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="p95"
                name={t("pior caso comum")}
                stroke={CORES_DA_SERIE.latenciaPior}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title={t("Quanto foi para uma pessoa (%)")}>
        {!hasHandoff ? (
          <ChartEmpty />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={handoffData}
              margin={margemDoChart}
            >
              <CartesianGrid {...gridComum} />
              <XAxis
                dataKey="day"
                tickFormatter={(v) => formatTickDia(v, tagDoIdioma)}
                {...eixoComum}
                interval="preserveStartEnd"
              />
              <YAxis
                {...eixoComum}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                width={45}
              />
              <Tooltip
                formatter={(value) => [`${Number(value).toFixed(2)}%`, t("Handoff")]}
                labelFormatter={(label) => formatTickDia(String(label), tagDoIdioma)}
                contentStyle={chartTooltipStyle}
              />
              <Line
                type="monotone"
                dataKey="pct"
                stroke={CORES_DA_SERIE.handoff}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
