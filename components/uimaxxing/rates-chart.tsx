import { InfoIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { periodicSeries, toPoints } from "@/lib/series";

const RANGES = ["1D", "1W", "1M", "6M", "1Y", "All"] as const;
const ACTIVE_RANGE = "1W";



const RATES: { label: string; value: string }[] = [
  { label: "Deposit APY", value: "1.82%" },
  { label: "Borrow APY", value: "2.34%" },
];

/** One copy of the plot, in viewBox units. Two are tiled to make the feed. */
const PLOT_W = 620;
const PLOT_H = 220;

/** Periodic across PLOT_W so the tiled copies meet without a visible seam. */
const BORROW = periodicSeries({
  n: 60,
  base: 0.62,
  harmonics: [
    { cycles: 1, amp: 0.13 },
    { cycles: 3, amp: 0.05, phase: 1.1 },
    { cycles: 7, amp: 0.02, phase: 0.4 },
  ],
});

const DEPOSIT = periodicSeries({
  n: 60,
  base: 0.32,
  harmonics: [
    { cycles: 1, amp: 0.09, phase: 0.5 },
    { cycles: 4, amp: 0.03, phase: 2.2 },
    { cycles: 9, amp: 0.012 },
  ],
});

export function RatesChart() {
  return (
    <div className="stroke-lit w-full max-w-3xl rounded-card fill-panel p-6">
      <h3 className="text-base font-semibold leading-none text-fg">
        Interest Rates
      </h3>
      <p className="mt-2 text-xs text-fg-muted">
        Current deposit and borrow interest rates for NRWD in this reserve.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr] md:gap-8">
        {/* Left: figures */}
        <div>
          {RATES.map((rate, i) => (
            <div key={rate.label}>
              {i > 0 ? <div className="my-5 border-t border-border" /> : null}
              <div className="row-hover -mx-2 flex items-center gap-1.5 rounded-sm px-2">
                <span className="text-xs text-fg-muted">{rate.label}</span>
                <InfoIcon className="size-3 text-fg-muted" weight="bold"/>
              </div>
              <div className="mt-2 text-3xl font-semibold leading-none tabular-nums text-fg">
                {rate.value}
              </div>
            </div>
          ))}
        </div>

        {/* Right: chart card */}
        <div className="rounded-xl border border-border fill-well p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="text-xs text-fg-secondary">Base Rates</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  className={cn(
                    "interactive rounded-sm px-1.5 py-0.5 text-[11px] leading-none hover:bg-white/[0.06]",
                    range === ACTIVE_RANGE
                      ? "font-medium text-fg"
                      : "text-fg-muted",
                  )}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          <svg
            viewBox="0 0 620 220"
            className="mt-4 h-auto w-full"
            aria-hidden="true"
          >
            <clipPath id="rates-plot">
              <rect x="0" y="0" width={PLOT_W} height={PLOT_H} />
            </clipPath>

            <g clipPath="url(#rates-plot)">
              <g
                className="graph-stream"
                style={{ "--stream-w": PLOT_W, "--stream-dur": "24s" } as React.CSSProperties}
              >
                {[
                  { data: BORROW, stroke: "#ffb37a" },
                  { data: DEPOSIT, stroke: "#34d399" },
                ].map(({ data, stroke }) => (
                  <g key={stroke}>
                    {/* Second copy sits one width along, so it is already on
                        screen when the first slides off. */}
                    {[0, PLOT_W].map((x0) => (
                      <polyline
                        key={x0}
                        points={toPoints(data, {
                          width: PLOT_W,
                          height: PLOT_H,
                          x0,
                          pad: 12,
                        })}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={1.2}
                        strokeLinejoin="round"
                      />
                    ))}
                  </g>
                ))}
              </g>
            </g>
          </svg>

          <div className="mt-3 flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#34d399]" />
              <span className="text-[11px] text-fg-secondary">Deposit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-accent-peach" />
              <span className="text-[11px] text-fg-secondary">Borrow</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
