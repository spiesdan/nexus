import { BookmarkIcon, LinkSimpleIcon, RepeatIcon } from "@phosphor-icons/react/ssr";

import { Avatar } from "@/components/ui/avatar";
import { periodicSeries, toPoints } from "@/lib/series";

const OUTCOMES = [
  { label: "25 bps decrease", value: "1%" },
  { label: "No change", value: "56%" },
  { label: "25 bps increase", value: "43%" },
  { label: "50+ bps increase", value: "1%" },
];

const LEGEND = [
  { color: "#5b8dee", label: "No change", value: "56%" },
  { color: "#6d7cff", label: "25 bps increase", value: "43%" },
  { color: "#ffb37a", label: "25 bps decrease", value: "<1%" },
  { color: "#ffb37a", label: "50+ bps increase", value: "<1%" },
];

const COMMENTS = [
  {
    seed: 1,
    name: "JeanneDeVolt",
    body: "Fullspeed across the casino, that's the intended way, amen.",
  },
  { seed: 3, name: "AluCard", body: "Insha Allah" },
];

const GRIDLINES = [
  { y: 60, label: "80%" },
  { y: 116, label: "60%" },
  { y: 172, label: "40%" },
  { y: 228, label: "20%" },
  { y: 285, label: "0%" },
];

/** One copy of the plot, in viewBox units. Two are tiled to make the feed. */
const PLOT_W = 585;
const PLOT_H = 300;

/**
 * Each series is periodic across PLOT_W, so the two tiled copies meet exactly
 * and the seam never shows as the feed slides. Cycle counts are whole numbers
 * for that reason; the differing counts per series keep the four lines from
 * moving as one rigid shape.
 */
const SERIES = {
  noChange: periodicSeries({
    n: 26,
    base: 0.56,
    harmonics: [
      { cycles: 1, amp: 0.1 },
      { cycles: 3, amp: 0.035, phase: 0.9 },
      { cycles: 7, amp: 0.014, phase: 2.1 },
    ],
  }),
  increase: periodicSeries({
    n: 26,
    base: 0.42,
    harmonics: [
      // Inverted first harmonic: as "no change" rises, this falls against it.
      { cycles: 1, amp: -0.09 },
      { cycles: 4, amp: 0.03, phase: 1.7 },
      { cycles: 9, amp: 0.012 },
    ],
  }),
  decrease: periodicSeries({
    n: 26,
    base: 0.05,
    harmonics: [
      { cycles: 2, amp: 0.012 },
      { cycles: 6, amp: 0.006, phase: 1.2 },
    ],
  }),
  bigIncrease: periodicSeries({
    n: 26,
    base: 0.03,
    harmonics: [
      { cycles: 3, amp: 0.01, phase: 2.4 },
      { cycles: 8, amp: 0.005 },
    ],
  }),
};

const LINES = [
  { key: "decrease", stroke: "#ffb37a" },
  { key: "bigIncrease", stroke: "#ffb37a" },
  { key: "increase", stroke: "#6d7cff" },
  { key: "noChange", stroke: "#5b8dee" },
] as const;

/**
 * Prediction market outcome card — an odds ladder on the left, a stepped
 * probability chart on the right.
 */
export function PredictionMarketCard() {
  return (
    <div className="w-full max-w-3xl rounded-card stroke-lit fill-panel p-5">
      {/* Header */}
      <div className="flex items-start gap-3.5">
        <div className="bg-orb size-12 shrink-0 overflow-hidden rounded-lg" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-xs text-fg-muted">Politics · Rates</div>
          <h3 className="mt-1 truncate text-xl font-semibold text-fg">
            Rate Decision in September?
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-1">
          <button type="button" aria-label="Copy link" className="interactive grid size-7 place-items-center rounded-full text-fg-muted hover:bg-white/[0.08] hover:text-fg">
            <LinkSimpleIcon className="size-4" />
          </button>
          <button type="button" aria-label="Bookmark market" className="interactive grid size-7 place-items-center rounded-full text-fg-muted hover:bg-white/[0.08] hover:text-fg">
            <BookmarkIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
        {/* Left — outcomes, chatter, volume */}
        <div>
          <div>
            {OUTCOMES.map((o) => (
              <div
                key={o.label}
                className="row-hover -mx-2 flex h-12 items-center justify-between rounded-lg border-b border-border px-2 text-sm"
              >
                <span className="text-fg">{o.label}</span>
                <span className="text-lg font-semibold tabular-nums text-fg">
                  {o.value}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {COMMENTS.map((c) => (
              <div key={c.name} className="flex items-start gap-2.5">
                <Avatar seed={c.seed} size="sm" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-fg">{c.name}</div>
                  <p className="mt-0.5 text-xs leading-snug text-fg-muted">
                    {c.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 text-xs text-fg-muted">$64M Vol.</div>
        </div>

        {/* Right — legend + stepped chart */}
        <div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span
                  className="size-1.5 rounded-pill"
                  style={{ backgroundColor: l.color }}
                  aria-hidden
                />
                <span className="text-fg-secondary">{l.label}</span>
                <span className="font-medium tabular-nums text-fg">
                  {l.value}
                </span>
              </span>
            ))}
          </div>

          <svg
            viewBox="0 0 640 300"
            className="mt-3 h-auto w-full"
            fill="none"
            aria-hidden
          >
            {GRIDLINES.map((g) => (
              <g key={g.label}>
                <line
                  x1="0"
                  y1={g.y}
                  x2="585"
                  y2={g.y}
                  stroke="currentColor"
                  strokeOpacity="0.06"
                  strokeDasharray="2 4"
                />
                <text x="600" y={g.y + 3} fill="var(--color-fg-muted)" fontSize="10">
                  {g.label}
                </text>
              </g>
            ))}
            {/* Clipped so the tiled copies never spill over the axis labels. */}
            <clipPath id="pmc-plot">
              <rect x="0" y="0" width={PLOT_W} height={PLOT_H} />
            </clipPath>

            <g clipPath="url(#pmc-plot)">
              <g
                className="graph-stream"
                style={{ "--stream-w": PLOT_W, "--stream-dur": "26s" } as React.CSSProperties}
              >
                {LINES.map(({ key, stroke }) => (
                  <g key={key}>
                    {/* Two copies, one width apart: the second is already on
                        screen when the first slides off, so the feed is
                        continuous rather than a clip that restarts. */}
                    {[0, PLOT_W].map((x0) => (
                      <polyline
                        key={x0}
                        points={toPoints(SERIES[key], {
                          width: PLOT_W,
                          height: PLOT_H,
                          x0,
                          pad: 10,
                          stepped: true,
                        })}
                        stroke={stroke}
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                    ))}
                  </g>
                ))}
              </g>
            </g>
          </svg>

          <div className="mt-2 flex items-center justify-end gap-1.5 text-xs text-fg-muted">
            <RepeatIcon className="size-3" aria-hidden />
            <span>Monthly</span>
            <span>·</span>
            <span className="font-medium text-fg-secondary">Northwind</span>
          </div>
        </div>
      </div>
    </div>
  );
}
