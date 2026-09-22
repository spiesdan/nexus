import { InfoIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

const R = 24;
const C = 2 * Math.PI * R;

type Gauge = {
  pct: number;
  arc: string;
  label: string;
  value: string;
  of: string;
  sub: string;
};

const GAUGES: Gauge[] = [
  {
    pct: 58,
    arc: "#34d399",
    label: "Total Deposits",
    value: "$70.78m",
    of: "$121.65m",
    sub: "29.09k of 50.00k NRWD",
  },
  {
    pct: 4,
    arc: "#ffb37a",
    label: "Total Borrows",
    value: "$319.46k",
    of: "$8.03m",
    sub: "131.31 of 3.30k NRWD",
  },
];

type Row = {
  label: string;
  value: string;
  secondary?: string;
  dotted?: boolean;
};

const LEFT_ROWS: Row[] = [
  { label: "Hub", value: "Core", dotted: true },
  { label: "Market", value: "Main", dotted: true },
  { label: "Deposit capacity", value: "50.00k NRWD", secondary: "$121.65m" },
  { label: "Borrow capacity", value: "3.30k NRWD", secondary: "$8.03m" },
  { label: "Use as collateral", value: "Supported" },
];

const RIGHT_ROWS: Row[] = [
  { label: "Collateral factor", value: "83.00%" },
  { label: "Collateral risk", value: "0.00%" },
  { label: "Liquidation penalty", value: "5.00% - 5.55%" },
  { label: "Target health factor", value: "1.24" },
];

function Donut({ pct, arc }: { pct: number; arc: string }) {
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
        <circle
          cx="28"
          cy="28"
          r={R}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="5"
        />
        <circle
          cx="28"
          cy="28"
          r={R}
          fill="none"
          stroke={arc}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * C} ${C}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] tabular-nums text-fg-secondary">
        {pct}%
      </span>
    </div>
  );
}

function ParamRow({ row }: { row: Row }) {
  return (
    /* Label and value sit on one line while the card is wide enough for both,
       and stack once it is not. The alternative — keeping them opposed at every
       width — is what broke this: "Deposit capacity" wrapped to two lines and
       its value to three, inside a row fixed at 44px. */
    <div className="row-hover -mx-2 flex min-h-11 flex-col items-start justify-center gap-x-4 rounded-lg px-2 py-2 text-sm @sm:flex-row @sm:items-center @sm:justify-between @sm:py-0">
      <span className="flex shrink-0 items-center gap-1.5 text-fg-muted">
        {row.label}
        <InfoIcon className="size-3 shrink-0" weight="bold"/>
      </span>
      {/* Each figure is atomic: the line may break between "50.00k NRWD" and
          "$121.65m", never inside either of them. */}
      <span className="min-w-0 tabular-nums text-fg @sm:text-right">
        <span
          className={cn(
            "inline-block whitespace-nowrap",
            row.dotted && "underline decoration-dotted underline-offset-4",
          )}
        >
          {row.value}
        </span>
        {row.secondary ? (
          <>
            {" "}
            <span className="inline-block whitespace-nowrap text-fg-muted">
              {row.secondary}
            </span>
          </>
        ) : null}
      </span>
    </div>
  );
}

export function ProtocolParameters() {
  return (
    <div className="@container hover-raise stroke-lit w-full max-w-3xl rounded-card fill-panel p-6">
      <h3 className="text-base font-semibold text-fg">Protocol Parameters</h3>
      <p className="mt-1 text-xs text-fg-muted">
        Market parameters come from two protocol layers: the hub and the market.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-y-3 @xl:grid-cols-2">
        {GAUGES.map((g, i) => (
          <div
            key={g.label}
            className={cn(
              "flex min-w-0 items-center gap-4",
              /* The rule divides two gauges sitting side by side. Once they
                 stack it is a stray vertical line above a full-width block,
                 so it arrives with the second column and not before. */
              i > 0 && "@xl:border-l @xl:border-border @xl:pl-8",
            )}
          >
            <Donut pct={g.pct} arc={g.arc} />
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                {g.label}
                <InfoIcon className="size-3 shrink-0" weight="bold"/>
              </span>
              <p className="mt-1 tabular-nums">
                <span className="text-xl font-semibold text-fg">{g.value}</span>
                <span className="text-xl text-fg-muted"> of </span>
                <span className="text-xl font-semibold text-fg">{g.of}</span>
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-fg-muted">{g.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-1 rounded-2xl border border-border fill-well p-6 @xl:grid-cols-2">
        <div className="border-border @xl:border-r @xl:pr-10">
          {LEFT_ROWS.map((row) => (
            <ParamRow key={row.label} row={row} />
          ))}
        </div>
        <div>
          {RIGHT_ROWS.map((row) => (
            <ParamRow key={row.label} row={row} />
          ))}
        </div>
      </div>
    </div>
  );
}
