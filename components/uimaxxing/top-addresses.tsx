import { CaretUpDownIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

type AddressRow = {
  address: string;
  share: number;
  amount: string;
  usd: string;
};

const ROWS: AddressRow[] = [
  { address: "0×7265…11a5", share: 16.49, amount: "4.80k", usd: "$11.67m" },
  { address: "0×a2Fa…37B8", share: 10.18, amount: "2.96k", usd: "$7.20m" },
  { address: "0×dd64…c737", share: 7.16, amount: "2.08k", usd: "$5.07m" },
  { address: "0×507B…96D6", share: 5.51, amount: "1.60k", usd: "$3.90m" },
  { address: "0×F757…d977", share: 3.44, amount: "1.00k", usd: "$2.44m" },
  { address: "0×d48f…6111", share: 2.32, amount: "674.22", usd: "$1.64m" },
  { address: "0×8DF7…4f86", share: 2.17, amount: "631.71", usd: "$1.54m" },
  { address: "0×6A27…841d", share: 1.85, amount: "538.24", usd: "$1.31m" },
  { address: "0×7eac…fA09", share: 1.74, amount: "505.10", usd: "$1.23m" },
  { address: "0×412B…72BC", share: 1.72, amount: "500.62", usd: "$1.22m" },
];

const MAX_SHARE = 16.49;
const MAX_BAR = 100;

const GRID = "grid grid-cols-[150px_1fr_auto] items-center gap-4";

const TABS = ["Deposits", "Borrows"] as const;

export function TopAddresses() {
  return (
    <div className="stroke-lit w-full max-w-3xl rounded-card fill-panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-[200px] flex-1">
          <h3 className="text-base font-semibold text-fg">Top Addresses</h3>
          <p className="mt-1 text-xs text-fg-muted">
            Breakdown of the largest positions by address, based on selected
            activity
          </p>
        </div>
        <div className="flex shrink-0 rounded-pill bg-white/[0.04] p-1">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              type="button"
              className={cn(
                "h-8 rounded-pill px-4 text-xs font-medium interactive",
                i === 0
                  ? "bg-white/[0.08] text-fg"
                  : "text-fg-muted hover:text-fg-secondary",
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border fill-well p-5">
        {/* The columns are too specific to reflow — a 180px address next to a
            bar next to a right-aligned amount has no narrow arrangement that
            still reads. So the table holds its shape and scrolls itself; the
            negative margin lets a row reach the panel's padding edge. */}
        <div className="scroll-track -mx-5 px-5">
        <div className="min-w-[560px]">
        <div className={cn(GRID, "pb-2")}>
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted">
            Holder
          </span>
          <button type="button" className="interactive flex items-center gap-1 rounded-sm px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted hover:text-fg">
            Share of Deposits
            <CaretUpDownIcon className="size-3 shrink-0" weight="bold"/>
          </button>
          <span className="text-right text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted">
            Deposited
          </span>
        </div>

        {ROWS.map((row) => (
          <div
            key={row.address}
            className={cn(GRID, "row-hover snap-item h-12 border-t border-white/[0.05] text-sm")}
          >
            <span className="truncate text-fg">{row.address}</span>
            <span className="flex items-center">
              <span
                className="h-2 rounded-pill bg-accent-indigo/70"
                style={{ width: `${(row.share / MAX_SHARE) * MAX_BAR}px` }}
              />
              <span className="ml-3 tabular-nums text-fg">
                {row.share.toFixed(2)}%
              </span>
            </span>
            <span className="text-right tabular-nums">
              <span className="font-medium text-fg">{row.amount} NRWD</span>
              <span className="text-fg-muted"> {row.usd}</span>
            </span>
          </div>
        ))}
        </div>
        </div>
      </div>
    </div>
  );
}
