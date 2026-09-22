import { ArrowsClockwiseIcon, InfoIcon, XIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

type LimitRow = {
  label: string;
  resets: string;
  width: string;
  used: string;
  track: string;
  fill: string;
};

const WEEKLY: LimitRow[] = [
  {
    label: "All models",
    resets: "Resets in 23 hr 2 min",
    width: "w-[86%]",
    used: "86% used",
    track: "bg-accent-peach/20",
    fill: "bg-accent-peach",
  },
  {
    label: "Advanced",
    resets: "Resets in 23 hr 2 min",
    width: "w-[84%]",
    used: "84% used",
    track: "bg-accent-peach/20",
    fill: "bg-accent-peach",
  },
];

function LimitBar({ row }: { row: LimitRow }) {
  return (
    <div className="grid grid-cols-[minmax(0,104px)_minmax(0,1fr)_56px] items-center gap-3 sm:grid-cols-[180px_1fr_80px] sm:gap-4">
      <div>
        <p className="text-sm text-fg">{row.label}</p>
        <p className="mt-0.5 text-xs text-fg-muted">{row.resets}</p>
      </div>
      <div className={cn("h-1.5 rounded-pill transition-all duration-300 ease-snap", row.track)}>
        <div className={cn("h-full rounded-pill", row.width, row.fill)} />
      </div>
      <span className="text-right text-xs text-fg-secondary tabular-nums">
        {row.used}
      </span>
    </div>
  );
}

export function UsageLimits() {
  return (
    <div className="stroke-lit relative w-full max-w-2xl rounded-card fill-panel p-6">
      <XIcon className="absolute right-5 top-5 size-4 text-fg-muted" />

      <div className="flex items-baseline gap-2">
        <h3 className="text-base font-semibold text-fg">Your usage limits</h3>
        <span className="text-base text-fg-muted">Team</span>
      </div>

      <div className="mt-5">
        <LimitBar
          row={{
            label: "Current session",
            resets: "Resets in 4 hr 52 min",
            width: "w-[13%]",
            used: "13% used",
            track: "bg-accent-blue/20",
            fill: "bg-accent-blue",
          }}
        />
      </div>

      <h3 className="mt-8 text-base font-semibold text-fg">Weekly limits</h3>

      <div className="mt-4 flex gap-3 rounded-xl border border-border bg-white/[0.02] p-4">
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-fg-muted" />
        <p className="text-sm text-fg-secondary">
          <span className="font-semibold text-fg">
            Your limits are temporarily boosted.
          </span>{" "}
          Your weekly{" "}
          <span className="text-accent-blue underline">
            workspace limit is 50% higher
          </span>{" "}
          through August 31. When the promotion ends, limits return to your
          plan&apos;s standard amounts.
        </p>
      </div>

      <p className="mt-4 text-sm text-accent-blue underline">
        <button type="button" className="interactive underline underline-offset-2 hover:text-fg-secondary">
          Learn more about usage limits
        </button>
      </p>

      <div className="mt-6 flex flex-col gap-5">
        {WEEKLY.map((row) => (
          <LimitBar key={row.label} row={row} />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <span className="text-xs text-fg-muted">Last updated: just now</span>
        <button type="button" aria-label="Refresh usage" className="hover-spin interactive grid size-6 place-items-center rounded-full text-fg-muted hover:bg-white/[0.08] hover:text-fg"><ArrowsClockwiseIcon className="size-3.5" /></button>
      </div>
    </div>
  );
}
