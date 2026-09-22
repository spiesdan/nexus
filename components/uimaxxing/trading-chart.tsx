import {
  CalendarDotsIcon,
  CameraIcon,
  ChartLineIcon,
  CornersOutIcon,
  FadersHorizontalIcon,
} from "@phosphor-icons/react/ssr";

import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** Animation-name prefix — keeps this keyframe off the shared sheet. */
const KEY = "trading-chart";

const UP = "#64b07a";
const DOWN = "#c36d68";

/** [open, high, low, close] — gentle uptrend ~147.5 → 156.89, hardcoded. */
const CANDLES: [number, number, number, number][] = [
  [147.6, 148.3, 147.2, 147.9],
  [147.9, 148.2, 147.1, 147.5],
  [147.5, 148.1, 147.3, 147.8],
  [147.8, 148.0, 147.0, 147.4],
  [147.4, 148.4, 147.2, 148.1],
  [148.1, 149.2, 147.9, 148.9],
  [148.9, 149.9, 148.6, 149.6],
  [149.6, 149.9, 148.9, 149.2],
  [149.2, 150.4, 149.0, 150.1],
  [150.1, 151.3, 149.8, 150.9],
  [150.9, 152.0, 150.6, 151.6],
  [151.6, 151.9, 150.9, 151.2],
  [151.2, 152.6, 151.0, 152.3],
  [152.3, 153.5, 152.0, 153.1],
  [153.1, 154.2, 152.9, 153.8],
  [153.8, 154.1, 153.1, 153.4],
  [153.4, 154.6, 153.2, 154.2],
  [154.2, 155.2, 154.0, 154.8],
  [154.8, 155.1, 154.2, 154.5],
  [154.5, 155.3, 154.3, 155.0],
  [155.0, 155.2, 154.1, 154.4],
  [154.4, 155.2, 154.2, 154.9],
  [154.9, 155.0, 153.9, 154.2],
  [154.2, 154.4, 153.2, 153.5],
  [153.5, 154.2, 153.3, 153.9],
  [153.9, 154.0, 152.6, 153.0],
  [153.0, 153.1, 151.8, 152.2],
  [152.2, 152.4, 151.1, 151.5],
  [151.5, 152.2, 151.2, 151.9],
  [151.9, 152.0, 150.8, 151.1],
  [151.1, 152.0, 150.9, 151.7],
  [151.7, 152.8, 151.4, 152.5],
  [152.5, 153.7, 152.2, 153.4],
  [153.4, 154.5, 153.1, 154.1],
  [154.1, 154.3, 153.3, 153.6],
  [153.6, 153.8, 152.5, 152.9],
  [152.9, 153.0, 152.1, 152.4],
  [152.4, 153.5, 152.2, 153.2],
  [153.2, 154.7, 153.0, 154.3],
  [154.3, 155.9, 154.1, 155.5],
  [155.5, 157.1, 155.3, 156.7],
  [156.7, 157.0, 155.8, 156.2],
  [156.2, 157.7, 156.0, 157.3],
  [157.3, 158.2, 157.0, 157.9],
  [157.78, 158.5, 156.88, 156.89],
];

/** Volume per candle, in millions — last bar matches the 1.47M legend. */
const VOLUMES = [
  0.9, 1.2, 1.1, 1.3, 0.8, 0.7, 1.6, 1.4, 2.2, 1.5, 1.2, 1.0, 1.4, 1.3, 1.5,
  0.9, 1.1, 1.4, 1.2, 0.8, 0.7, 1.2, 1.5, 1.3, 1.6, 1.1, 1.4, 1.7, 1.3, 1.0,
  1.5, 1.8, 1.4, 2.8, 2.4, 1.2, 1.5, 1.9, 2.6, 2.1, 3.42, 1.6, 1.3, 2.3, 1.47,
];

const VB_W = 620;
const PLOT_W = 560;
const PLOT_H = 210;
const SLOT = PLOT_W / CANDLES.length;
const LAST = 156.89;
const yOf = (v: number) => ((161 - v) / 17) * PLOT_H;

const GRID_X = [0.065, 0.225, 0.385, 0.545, 0.705, 0.865].map(
  (f) => f * PLOT_W,
);
const DATES: { label: string; left: string }[] = [
  { label: "26 Mar", left: "5.87%" },
  { label: "4 Apr", left: "20.32%" },
  { label: "13 Apr", left: "34.77%" },
  { label: "22 Apr", left: "49.23%" },
  { label: "1 May", left: "63.68%" },
  { label: "10 May", left: "78.13%" },
];

function Caret({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 8 5" aria-hidden="true" className={cn("h-1.5 w-2", className)}>
      <path d="M0.5 0.5 L4 4.5 L7.5 0.5 Z" fill="currentColor" />
    </svg>
  );
}


export function TradingChart() {
  const yLast = yOf(LAST);

  return (
    <div className="stroke-lit w-full max-w-2xl rounded-xl bg-stage-2 text-[11px] shadow-2xl shadow-black/40">
      {/* (a) tabs */}
      <Tabs items={["Chart", "Funding"]} className="px-4 pt-3" />

      {/* (b) toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <button type="button" className="text-fg-muted interactive hover:text-fg-secondary">
          5m
        </button>
        <button type="button" className="text-fg-muted interactive hover:text-fg-secondary">
          1h
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md border border-border-strong px-2.5 py-1 font-medium text-fg"
        >
          D
          <Caret className="text-fg" />
        </button>
        <ChartLineIcon className="ml-2 size-4 text-fg-secondary" />
        <label className="ml-1 flex items-center gap-2.5 text-fg-secondary">
          <FadersHorizontalIcon className="size-4" />
          Indicators
        </label>
        <div className="ml-auto flex items-center gap-4 text-fg-secondary">
          <CameraIcon className="size-4" />
          <CornersOutIcon className="size-4" />
        </div>
      </div>

      {/* (c) symbol row */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 pb-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-semibold text-fg">NRWD/TSSD</span>
          <span className="text-fg-muted">·</span>
          <span className="text-fg-muted">1D</span>
          <span className="text-fg-muted">·</span>
          <span className="text-fg-muted">Northwind</span>
          <span className="ml-1 inline-flex items-center gap-1.5 rounded-pill bg-positive-bg px-2 py-[3px]">
            <span className="size-1.5 rounded-full bg-code-add" />
            <span className="text-[9px] font-semibold tracking-[0.14em] text-code-add">
              LIVE
            </span>
          </span>
        </div>
        <div className="scroll-track flex max-w-full items-center gap-1.5 whitespace-nowrap text-[10.5px] tabular-nums">
          <span className="text-fg-muted">O</span>
          <span className="text-fg-secondary">157.78</span>
          <span className="text-fg-muted">H</span>
          <span className="text-fg-secondary">158.50</span>
          <span className="text-fg-muted">L</span>
          <span className="text-fg-secondary">156.88</span>
          <span className="text-fg-muted">C</span>
          <span className="font-medium text-fg">156.89</span>
          <span className="ml-1 text-code-add">+9.91 (+6.74%)</span>
        </div>
      </div>

      {/* (d) candlestick chart */}
      <div className="px-2">
        <svg
          viewBox={`0 0 ${VB_W} ${PLOT_H}`}
          className="h-auto w-full"
          aria-hidden="true"
        >
          {/* horizontal gridlines */}
          {[145, 150, 155, 160].map((v) => (
            <line
              key={v}
              x1={0}
              x2={PLOT_W}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke="currentColor"
              strokeOpacity={0.05}
              strokeWidth={1}
            />
          ))}
          {/* vertical gridlines */}
          {GRID_X.map((x) => (
            <line
              key={x}
              x1={x}
              x2={x}
              y1={0}
              y2={PLOT_H}
              stroke="currentColor"
              strokeOpacity={0.04}
              strokeWidth={1}
            />
          ))}
          {/* y-axis labels */}
          {[160, 155, 150, 145].map((v) => (
            <text
              key={v}
              x={566}
              y={yOf(v) + 3}
              fill="var(--color-fg-muted)"
              fontSize={9.5}
             
            >
              {v.toFixed(2)}
            </text>
          ))}
          <style>{`
            /* Only the last print is live. History does not move — scrolling
               it would slide the candles out from under the fixed date axis —
               so the tick is confined to the newest candle and the crosshair
               and tag that read off it, all on one clock so they never
               disagree about where the price is. */
            @keyframes ${KEY}-tick {
              0%, 100% { transform: translateY(0); }
              38%      { transform: translateY(-2.1px); }
              72%      { transform: translateY(1.4px); }
            }
            .${KEY}-tick {
              animation: ${KEY}-tick 3400ms ease-in-out infinite;
            }
            @media (prefers-reduced-motion: reduce) {
              .${KEY}-tick { animation: none; }
            }
          `}</style>
          {/* candles */}
          {CANDLES.map(([o, h, l, c], i) => {
            const x = i * SLOT + SLOT / 2;
            const up = c >= o;
            const color = up ? UP : DOWN;
            const top = yOf(Math.max(o, c));
            const bodyH = Math.max(1.5, Math.abs(yOf(o) - yOf(c)));
            return (
              <g key={i} className={i === CANDLES.length - 1 ? `${KEY}-tick` : undefined}>
                <line
                  x1={x}
                  x2={x}
                  y1={yOf(h)}
                  y2={yOf(l)}
                  stroke={color}
                  strokeWidth={1}
                />
                <rect x={x - 3.5} y={top} width={7} height={bodyH} rx={1} fill={color} />
              </g>
            );
          })}
          {/* crosshair at last price — same clock as the last candle */}
          <g className={`${KEY}-tick`}>
          <line
            x1={0}
            x2={PLOT_W}
            y1={yLast}
            y2={yLast}
            stroke={DOWN}
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <rect x={562} y={yLast - 8.5} width={54} height={17} rx={4} fill={DOWN} />
          <text
            x={589}
            y={yLast + 3.5}
            fill="#ffffff"
            fontSize={10}
            fontWeight={700}
            textAnchor="middle"
           
          >
            156.89
          </text>
          </g>
        </svg>

        {/* (e) volume */}
        <div className="mt-1 flex items-center gap-2 px-2 text-[10px] text-fg-muted">
          <span>Volume</span>
          <span className="ml-1 size-1.5 rounded-full bg-code-del" />
          <span>SMA 20</span>
          <span className="font-medium text-code-del">1.47M</span>
        </div>
        <svg viewBox={`0 0 ${VB_W} 48`} className="h-auto w-full" aria-hidden="true">
          {GRID_X.map((x) => (
            <line
              key={x}
              x1={x}
              x2={x}
              y1={0}
              y2={46}
              stroke="currentColor"
              strokeOpacity={0.04}
              strokeWidth={1}
            />
          ))}
          {VOLUMES.map((v, i) => {
            const x = i * SLOT + SLOT / 2;
            const [o = 0, , , c = 0] = CANDLES[i] ?? [0, 0, 0, 0];
            const barH = (v / 3.42) * 44;
            return (
              <rect
                key={i}
                x={x - 3.5}
                y={46 - barH}
                width={7}
                height={barH}
                fill={c >= o ? UP : DOWN}
                opacity={0.7}
              />
            );
          })}
          {/* SMA 20 line */}
          <g className="graph-breathe">
          <polyline
            points="6,29 60,27.5 110,28.5 160,27 210,28 260,29 310,28 360,27.5 410,26.5 460,26 510,25 554,25.5"
            fill="none"
            stroke={DOWN}
            strokeWidth={1.2}
          />
          </g>
          <text x={566} y={11} fill="var(--color-fg-muted)" fontSize={9.5}>
            3.42M
          </text>
          <text x={566} y={46} fill="var(--color-fg-muted)" fontSize={9.5}>
            0
          </text>
        </svg>

        {/* (f) x-axis dates */}
        <div className="relative h-5">
          {DATES.map((d) => (
            <span
              key={d.label}
              style={{ left: d.left }}
              className="absolute top-0 -translate-x-1/2 text-[10px] text-fg-muted"
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>

      {/* (g) footer */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 border-t border-border px-3 py-2 text-[10px] text-fg-muted">
        <div className="flex flex-wrap items-center gap-1">
          {["5y", "1y", "6m", "3m", "1m", "5d", "1d"].map((r) => (
            <button
              key={r}
              type="button"
              className={cn(
                "rounded-md px-1.5 py-1 interactive",
                r === "6m"
                  ? "bg-white/10 font-semibold text-fg"
                  : "hover:text-fg-secondary",
              )}
            >
              {r}
            </button>
          ))}
          <CalendarDotsIcon className="ml-2 size-3.5 text-fg-secondary" />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <FadersHorizontalIcon className="size-3.5 text-fg-secondary" />
          <span>14:32:08</span>
          <span>UTC-4</span>
          <button type="button" className="interactive hover:text-fg-secondary">
            %
          </button>
          <button type="button" className="interactive hover:text-fg-secondary">
            log
          </button>
          <button
            type="button"
            className="rounded-md bg-white/10 px-1.5 py-1 font-semibold text-fg"
          >
            auto
          </button>
        </div>
      </div>
    </div>
  );
}
