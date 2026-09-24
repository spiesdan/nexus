"use client";

/*!
 * UImaxxing™ — © 2026 Yogi Suria. All rights reserved.
 * Free to use, modify and ship in your own products, commercial ones
 * included. Not for republication as a component library, and not as
 * machine-learning training data. See LICENSE.
 * @author Yogi Suria <yogi@jumper.xyz>
 * @license SEE LICENSE IN LICENSE
 * @preserve
 * provenance-mark: uim1-1ea983e5.44807c29
 */
import { useMemo, useState } from "react";
import { InfoIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { toPoints } from "@/lib/series";

export interface CrmSalesPoint {
  dia: number;
  vendidoAc: number;
  metaAc: number | null;
  projecao: number | null;
}

/**
 * ADAPT do `rates-chart` (UImaxxing Registry) para o módulo de Indicadores.
 *
 * Estrutura do showcase preservada: painel de figuras à esquerda, card de
 * gráfico à direita com seletor de faixa e legenda — dados trocados pelas
 * séries reais de vendas (acumulado do mês, meta e projeção).
 *
 * O seletor de faixa não é decorativo: recorta a série real (últimos N dias)
 * e renormaliza o eixo Y com o pico da janela escolhida.
 */
const RANGES = ["1D", "1W", "1M", "Tudo"] as const;
type Range = (typeof RANGES)[number];
const ACTIVE_RANGE: Range = "1M";

const PLOT_W = 620;
const PLOT_H = 220;

function janela(n: number, range: Range): number {
  if (range === "Tudo") return n;
  const dias = { "1D": 1, "1W": 7, "1M": 30 }[range];
  return Math.max(1, Math.min(n, dias));
}

function normalizar(v: number, max: number): number {
  return max > 0 ? v / max : 0;
}

export function CrmSalesChart({
  pontos,
  metaAc,
  projecao,
  previsaoMes,
}: {
  pontos: CrmSalesPoint[];
  // null = sem meta definida: a figura mostra "—" como o KPI acima e como os
  // Indicadores ("Sem meta"). Coagir para 0 desenhava "Meta do mês R$ 0",
  // que se lê como meta zerada — o oposto de "não há meta".
  metaAc: number | null;
  projecao: number;
  previsaoMes: number;
}) {
  const [range, setRange] = useState<Range>(ACTIVE_RANGE);
  const n = pontos.length;

  const janelaN = janela(n, range);
  const visiveis = janelaN >= n ? pontos : pontos.slice(n - janelaN);

  const pico = useMemo(
    () =>
      visiveis.reduce(
        (m, p) => Math.max(m, p.vendidoAc, p.metaAc ?? 0, p.projecao ?? 0),
        0,
      ) || 1,
    [visiveis],
  );

  const serieVendido = useMemo(
    () =>
      visiveis.map(
        (v): number => Number(normalizar(v.vendidoAc, pico).toFixed(3)),
      ),
    [visiveis, pico],
  );
  const serieMeta = useMemo(
    () =>
      visiveis.map(
        (v): number =>
          v.metaAc == null ? -1 : Number(normalizar(v.metaAc, pico).toFixed(3)),
      ),
    [visiveis, pico],
  );
  const serieProjecao = useMemo(
    () =>
      visiveis.map(
        (v): number =>
          v.projecao == null ? -1 : Number(normalizar(v.projecao, pico).toFixed(3)),
      ),
    [visiveis, pico],
  );

  const valorVendido = serieVendido.map(Number);
  const pontosVendido = toPoints(valorVendido, {
    width: PLOT_W,
    height: PLOT_H,
    pad: 12,
  });
  const pontosMeta = toPoints(
    serieMeta.map((v, i) => (v < 0 ? (valorVendido[i] ?? v) : v)),
    { width: PLOT_W, height: PLOT_H, pad: 12 },
  );
  const pontosProjecao = toPoints(
    serieProjecao.map((v, i) => (v < 0 ? (valorVendido[i] ?? v) : v)),
    { width: PLOT_W, height: PLOT_H, pad: 12 },
  );

  return (
    <div className="stroke-lit w-full max-w-3xl rounded-xl fill-panel p-6">
      <h3 className="text-base font-semibold leading-none text-fg">
        Evolução de Venda
      </h3>
      <p className="mt-2 text-xs text-fg-muted">
        Acumulado do mês frente à meta e à projeção de fechamento.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr] md:gap-8">
        {/* Left: figures */}
        <div>
          {[
            { label: "Meta do mês", value: metaAc },
            { label: "Projeção", value: projecao },
            { label: "Previsão", value: previsaoMes },
          ].map((f, i) => (
            <div key={f.label}>
              {i > 0 ? <div className="my-5 border-t border-border" /> : null}
              <div className="row-hover -mx-2 flex items-center gap-1.5 rounded-sm px-2">
                <span className="text-xs text-fg-muted">{f.label}</span>
                <InfoIcon className="size-3 text-fg-muted" weight="bold" />
              </div>
              <div className="mt-2 text-3xl font-semibold leading-none tabular-nums text-fg">
                {f.value == null
                  ? "—"
                  : new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      maximumFractionDigits: 0,
                    }).format(f.value / 100)}
              </div>
            </div>
          ))}
        </div>

        {/* Right: chart card */}
        <div className="rounded-xl border border-border fill-well p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="text-xs text-fg-secondary">
              Vendas acumuladas · {janelaN} {janelaN === 1 ? "dia" : "dias"}
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    "interactive rounded-sm px-1.5 py-0.5 text-[11px] leading-none hover:bg-white/[0.06]",
                    r === range ? "font-medium text-fg" : "text-fg-muted",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <svg
            viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
            className="mt-4 h-auto w-full"
            aria-hidden="true"
          >
            <clipPath id="crm-sales-plot">
              <rect x="0" y="0" width={PLOT_W} height={PLOT_H} />
            </clipPath>

            <g clipPath="url(#crm-sales-plot)">
              <polyline
                points={pontosProjecao}
                fill="none"
                stroke="#eab308"
                strokeWidth={1.2}
                strokeDasharray="6 3"
                strokeLinejoin="round"
              />
              <polyline
                points={pontosMeta}
                fill="none"
                stroke="#9a7bff"
                strokeWidth={1.2}
                strokeDasharray="6 3"
                strokeLinejoin="round"
              />
              <polyline
                points={pontosVendido}
                fill="none"
                stroke="#34d399"
                strokeWidth={1.2}
                strokeLinejoin="round"
              />
            </g>
          </svg>

          <div className="mt-3 flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#34d399]" />
              <span className="text-[11px] text-fg-secondary">Vendido</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-accent-violet" />
              <span className="text-[11px] text-fg-secondary">Meta</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#eab308]" />
              <span className="text-[11px] text-fg-secondary">Projeção</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}