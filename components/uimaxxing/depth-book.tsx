import {
  ArrowsClockwiseIcon,
  CaretUpIcon,
  CurrencyCircleDollarIcon,
  InfoIcon,
  TextAlignJustifyIcon,
} from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

type BookRow = {
  price: string;
  shares: string;
  total: string;
  width: string;
  pill?: string;
};

const ASKS: BookRow[] = [
  { price: "92¢", shares: "113.70", total: "$252.27", width: "w-[4%]" },
  { price: "91¢", shares: "70.90", total: "$147.67", width: "w-[3%]" },
  { price: "90¢", shares: "69.34", total: "$83.15", width: "w-[3%]" },
  { price: "89¢", shares: "23.30", total: "$20.74", width: "w-[2%]", pill: "Asks" },
];

const BIDS: BookRow[] = [
  { price: "88¢", shares: "125.00", total: "$110.00", width: "w-[5%]", pill: "Bids" },
  { price: "87¢", shares: "125.00", total: "$218.75", width: "w-[6%]" },
  { price: "86¢", shares: "208.00", total: "$397.63", width: "w-[8%]" },
  { price: "85¢", shares: "143.00", total: "$519.18", width: "w-[10%]" },
];

/* Below sm the numeric columns give up a third of their width — four columns
   still read at that size, so shrinking beats a scroll track here. */
const GRID =
  "grid grid-cols-[minmax(0,1fr)_52px_52px_66px] items-center sm:grid-cols-[1fr_100px_100px_120px]";

function Row({ row, side }: { row: BookRow; side: "ask" | "bid" }) {
  return (
    <div className={cn(GRID, "row-hover snap-item relative h-11 px-3 sm:px-5 text-sm tabular-nums")}>
      <div
        className={cn(
          "absolute inset-y-0 left-0",
          row.width,
          side === "ask" ? "bg-negative-bg/60" : "bg-positive-bg/70",
        )}
        aria-hidden="true"
      />
      <div className="relative">
        {row.pill ? (
          <span
            className={cn(
              "rounded-pill px-2 py-0.5 text-[10px] font-semibold",
              side === "ask"
                ? "bg-negative text-white"
                : "bg-positive text-well",
            )}
          >
            {row.pill}
          </span>
        ) : null}
      </div>
      <span
        className={cn(
          "relative text-right font-medium",
          side === "ask" ? "text-negative" : "text-positive",
        )}
      >
        {row.price}
      </span>
      <span className="relative text-right text-fg-secondary">{row.shares}</span>
      <span className="relative text-right text-fg">{row.total}</span>
    </div>
  );
}

export function DepthBook() {
  return (
    <div className="stroke-lit w-full max-w-2xl overflow-hidden rounded-card fill-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 sm:px-5 py-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold leading-none text-fg">
            Order Book
          </h3>
          <InfoIcon className="interactive size-3.5 text-fg-muted hover:text-fg" weight="bold"/>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-fg-muted">$0 Vol.</span>
          <button type="button" aria-label="Collapse book" className="interactive grid size-7 place-items-center rounded-full text-fg-muted hover:bg-white/[0.08] hover:text-fg"><CaretUpIcon className="size-4" weight="bold"/></button>
        </div>
      </div>

      {/* Sub-header */}
      <div className="flex flex-wrap items-center gap-y-2 border-b border-border px-3 py-3 sm:px-5">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-fg">Trade Up</span>
          <span className="text-sm text-fg-muted">Trade Down</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1 text-xs font-medium text-accent-peach">
            <CurrencyCircleDollarIcon className="size-3.5" weight="bold"/>
            Maker Rebate
          </span>
          <span className="text-xs font-medium text-accent-indigo">
            + Rewards
          </span>
          <button type="button" aria-label="Refresh" className="hover-spin interactive grid size-7 place-items-center rounded-full text-fg-muted hover:bg-white/[0.08] hover:text-fg size-6"><ArrowsClockwiseIcon className="size-3.5" weight="bold"/></button>
        </div>
      </div>

      {/* Column header */}
      <div
        className={cn(
          GRID,
          "h-8 px-3 sm:px-5 text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted",
        )}
      >
        <span className="flex items-center gap-1.5">
          <TextAlignJustifyIcon className="size-3" weight="bold"/>
          Trade Up
        </span>
        <span className="text-right">Price</span>
        <span className="text-right">Shares</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks */}
      {ASKS.map((row) => (
        <Row key={row.price} row={row} side="ask" />
      ))}

      {/* Spread */}
      <div className="relative flex h-10 items-center border-y border-border px-3 sm:px-5 text-xs text-fg-muted">
        <span className="tabular-nums">Last: 88¢</span>
        <span className="absolute left-1/2 -translate-x-1/2 tabular-nums">
          Spread: 1¢
        </span>
      </div>

      {/* Bids */}
      {BIDS.map((row) => (
        <Row key={row.price} row={row} side="bid" />
      ))}
    </div>
  );
}
