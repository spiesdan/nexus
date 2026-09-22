import {
  BookmarkIcon,
  CaretDoubleDownIcon,
  CodeIcon,
  InfoIcon,
  LinkSimpleIcon,
} from "@phosphor-icons/react/ssr";

import { periodicSeries, toPoints } from "@/lib/series";

const GRIDLINES = [
  { y: 40, label: "$2,435.80" },
  { y: 85, label: "$2,435.60" },
  { y: 130, label: "$2,435.40" },
  { y: 175, label: "$2,435.20" },
  { y: 220, label: "$2,435.00" },
];

const KEY = "live-ticker";

/** One copy of the plot, in viewBox units. Two are tiled to make the feed. */
const PLOT_W = 580;
const PLOT_H = 260;
const PAD = 24;
/** The "now" marker sits here; the feed streams underneath it. */
const MARKER_X = 540;
const SAMPLES = 72;
const CYCLE_S = 16;

/** Periodic across PLOT_W, so the two tiled copies meet without a seam. */
const PRICE = periodicSeries({
  n: SAMPLES,
  base: 0.54,
  harmonics: [
    { cycles: 1, amp: 0.16 },
    { cycles: 3, amp: 0.06, phase: 1.4 },
    { cycles: 8, amp: 0.025, phase: 0.6 },
    { cycles: 17, amp: 0.01, phase: 2.7 },
  ],
});

const yAt = (v: number) => PAD + (PLOT_H - PAD * 2) * (1 - v);

/**
 * The marker has to ride the line rather than sit still while the feed slides
 * past it, so its vertical travel is generated from the same series and the
 * same clock: at progress f the feed has moved f*PLOT_W left, so the sample
 * sitting under the marker is the one f*SAMPLES further along. Deriving both
 * from one array is what keeps them from drifting apart.
 */
const MARKER_KEYFRAMES = (() => {
  const i0 = Math.round((MARKER_X / PLOT_W) * SAMPLES);
  const steps = 48;
  const frames: string[] = [];
  for (let k = 0; k <= steps; k++) {
    const f = k / steps;
    const v = PRICE[(i0 + Math.round(f * SAMPLES)) % SAMPLES] ?? 0;
    frames.push(`${((k / steps) * 100).toFixed(2)}% { transform: translateY(${yAt(v).toFixed(1)}px); }`);
  }
  return frames.join("\n          ");
})();


const TIMES = [
  "2:35:12 PM",
  "2:35:16 PM",
  "2:35:20 PM",
  "2:35:24 PM",
  "2:35:31 PM",
];

/**
 * Live five-minute up/down market — price-to-beat versus the running price,
 * with a countdown to settlement.
 */
export function LiveTickerChart() {
  return (
    <div className="w-full max-w-3xl rounded-card stroke-lit fill-panel p-5">
      {/* Header */}
      <div className="flex items-start gap-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#6d7cff]/90">
          <svg viewBox="0 0 24 24" className="size-5" fill="#ffffff" aria-hidden>
            <path d="M12 2.8 17.2 11.5 12 14.62 6.8 11.5 12 2.8Z" />
            <path d="M6.8 13.36 12 16.48 17.2 13.36 12 20.9 6.8 13.36Z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <h3 className="truncate text-xl font-semibold text-fg">
            NRWD Up or Down 5m
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
            <span>August 29, 5:05-5:10AM ET</span>
            <InfoIcon className="interactive size-3 hover:text-fg" aria-hidden />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-1">
          <button type="button" aria-label="Embed" className="interactive grid size-7 place-items-center rounded-full text-fg-muted hover:bg-white/[0.08] hover:text-fg">
            <CodeIcon className="size-4" />
          </button>
          <button type="button" aria-label="Copy link" className="interactive grid size-7 place-items-center rounded-full text-fg-muted hover:bg-white/[0.08] hover:text-fg">
            <LinkSimpleIcon className="size-4" />
          </button>
          <button type="button" aria-label="Bookmark" className="interactive grid size-7 place-items-center rounded-full text-fg-muted hover:bg-white/[0.08] hover:text-fg">
            <BookmarkIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Stat row */}
      <div className="mt-5 flex flex-wrap items-end gap-y-4">
        <div>
          <div className="text-xs text-fg-muted">Price To Beat</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">
            $2,434.76
          </div>
        </div>

        <div className="border-border px-0 sm:ml-5 sm:border-l sm:px-5">
          <div className="flex items-center gap-1.5 text-xs text-accent-blue">
            <span>Current Price</span>
            <span className="flex items-center gap-0.5 text-positive">
              <svg viewBox="0 0 8 6" className="size-[7px] fill-positive" aria-hidden>
                <path d="M4 0l4 6H0z" />
              </svg>
              $0.79
            </span>
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-accent-indigo">
            $2,435.55
          </div>
        </div>

        <div className="flex items-end gap-5 sm:ml-auto">
          <div className="flex items-start gap-3">
            <div className="text-center">
              <div className="text-3xl font-semibold leading-none tabular-nums text-negative">
                04
              </div>
              <div className="mt-1.5 text-[10px] uppercase tracking-wide text-fg-muted">
                Mins
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-semibold leading-none tabular-nums text-negative">
                23
              </div>
              <div className="mt-1.5 text-[10px] uppercase tracking-wide text-fg-muted">
                Secs
              </div>
            </div>
          </div>
          <span className="text-lg font-semibold text-fg-muted/60">
            Northwind
          </span>
        </div>
      </div>

      {/* Chart */}
      <svg
        viewBox="0 0 640 260"
        className="mt-4 h-auto w-full"
        fill="none"
        aria-hidden
      >
        {GRIDLINES.map((g) => (
          <g key={g.label}>
            <line
              x1="0"
              y1={g.y}
              x2="580"
              y2={g.y}
              stroke="currentColor"
              strokeOpacity="0.05"
            />
            <text
              x="590"
              y={g.y + 3}
              fill="var(--color-fg-muted)"
              fontSize="10"
              textAnchor="start"
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* Price to beat */}
        <line
          x1="0"
          y1="95"
          x2="580"
          y2="95"
          stroke="#6d7cff"
          strokeDasharray="4 4"
          strokeOpacity="0.8"
        />

        <style>{`
          @keyframes ${KEY}-marker {
            ${MARKER_KEYFRAMES}
          }
          .${KEY}-marker {
            animation: ${KEY}-marker ${CYCLE_S}s linear infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .${KEY}-marker { animation: none; }
          }
        `}</style>

        <clipPath id="lt-plot">
          <rect x="0" y="0" width={PLOT_W} height={PLOT_H} />
        </clipPath>

        <g clipPath="url(#lt-plot)">
          <g
            className="graph-stream"
            style={{ "--stream-w": PLOT_W, "--stream-dur": `${CYCLE_S}s` } as React.CSSProperties}
          >
            {/* Two copies one width apart, so the second is already on screen
                as the first slides off and the feed never restarts visibly. */}
            {[0, PLOT_W].map((x0) => (
              <polyline
                key={x0}
                points={toPoints(PRICE, { width: PLOT_W, height: PLOT_H, x0, pad: PAD })}
                fill="none"
                stroke="#6d7cff"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </g>
        </g>

        {/* Marker rides the same clock as the feed, so it stays on the line. */}
        <g className={`${KEY}-marker`}>
          <circle cx={MARKER_X} cy="0" r="11" fill="#6d7cff" opacity="0.18" className="marker-pulse" />
          <circle cx={MARKER_X} cy="0" r="5" fill="#6d7cff" />
        </g>
      </svg>

      {/* Markers */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="border-b border-dashed border-positive/50 pb-0.5 text-xs text-positive">
            + $7
          </span>
          <span className="border-b border-dashed border-negative/50 pb-0.5 text-xs text-negative">
            + $1
          </span>
        </div>
        <span className="flex items-center gap-1 rounded-md bg-white/[0.08] px-2 py-1 text-xs text-fg-secondary">
          Target
          <CaretDoubleDownIcon className="size-3" aria-hidden />
        </span>
      </div>

      {/* Footer */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-fg-muted">
          Source: northwind.co
        </span>
        {/* Five stamps need ~310px; below sm the axis thins to every other one. */}
        <div className="flex w-full justify-between text-[11px] tabular-nums text-fg-muted sm:w-auto sm:flex-1 sm:justify-around">
          {TIMES.map((t, i) => (
            <span key={t} className={i % 2 === 1 ? "hidden sm:inline" : undefined}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
