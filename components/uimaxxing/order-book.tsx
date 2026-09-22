import { DotsThreeVerticalIcon } from "@phosphor-icons/react/ssr";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const MAX_TOTAL = 86640;

/** Ask ladder, best ask last — totals are cumulative from the spread up. */
const ASKS: { price: string; size: string; total: string; depth: number }[] = [
  { price: "1.03498", size: "8,420", total: "86,640", depth: 86640 },
  { price: "1.03492", size: "5,140", total: "78,220", depth: 78220 },
  { price: "1.03487", size: "12,960", total: "73,080", depth: 73080 },
  { price: "1.03481", size: "3,275", total: "60,120", depth: 60120 },
  { price: "1.03476", size: "9,830", total: "56,845", depth: 56845 },
  { price: "1.03470", size: "6,405", total: "47,015", depth: 47015 },
  { price: "1.03465", size: "14,220", total: "40,610", depth: 40610 },
  { price: "1.03459", size: "4,760", total: "26,390", depth: 26390 },
  { price: "1.03454", size: "11,085", total: "21,630", depth: 21630 },
  { price: "1.03448", size: "7,930", total: "10,545", depth: 10545 },
  { price: "1.03443", size: "2,615", total: "2,615", depth: 2615 },
];

function Caret({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 8 5" aria-hidden="true" className={cn("h-1.5 w-2", className)}>
      <path d="M0.5 0.5 L4 4.5 L7.5 0.5 Z" fill="currentColor" />
    </svg>
  );
}

export function OrderBook() {
  return (
    <div className="stroke-lit w-full max-w-sm rounded-xl bg-surface shadow-2xl shadow-black/40">
      {/* header */}
      <div className="flex items-start justify-between border-b border-border pl-4 pr-2">
        <Tabs items={["Order Book", "Trades"]} className="border-b-0 pt-3" />
        <button
          type="button"
          aria-label="More options"
          className="mt-2 rounded-md p-1.5 text-fg-muted interactive hover:bg-white/[0.05] hover:text-fg-secondary"
        >
          <DotsThreeVerticalIcon className="size-4 transition-transform duration-200 ease-snap group-hover:scale-110" />
        </button>
      </div>

      {/* controls */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md bg-raised px-2 py-1 text-[11px] font-medium text-fg"
          >
            0.00001
            <Caret className="text-fg-muted" />
          </button>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-code-add" />
            <span className="text-[9px] font-medium tracking-[0.18em] text-fg-muted">
              LIVE
            </span>
          </span>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md bg-chip px-2.5 py-1 text-[11px] font-medium text-fg"
        >
          NRW-PERP
          <Caret className="text-fg-muted" />
        </button>
      </div>

      {/* column header */}
      <div className="grid grid-cols-3 px-3 pb-1.5 pt-1 text-[10px] uppercase tracking-[0.08em] text-fg-muted">
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {/* ask rows */}
      <div className="pb-1">
        {ASKS.map((row) => (
          <div
            key={row.price}
            className="relative grid h-[22px] grid-cols-3 items-center px-3 text-[11px] tabular-nums interactive hover:bg-white/[0.02]"
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 right-0"
              style={{
                width: `${(row.depth / MAX_TOTAL) * 100}%`,
                background:
                  "linear-gradient(to right, rgba(195,109,104,0.05), rgba(195,109,104,0.22))",
              }}
            />
            <span className="relative text-right text-code-del">{row.price}</span>
            <span className="relative text-right text-fg/90">{row.size}</span>
            <span className="relative text-right text-fg-muted">{row.total}</span>
          </div>
        ))}
      </div>

      {/* spread */}
      <div className="grid grid-cols-3 items-center rounded-b-xl border-t border-border bg-white/[0.02] px-3 py-2.5">
        <span className="text-[10px] uppercase tracking-[0.14em] text-fg-muted">
          Spread
        </span>
        <span className="text-right text-[11px] tabular-nums text-fg">
          0.00006
        </span>
        <span className="text-right text-[11px] tabular-nums text-fg-muted">
          0.006%
        </span>
      </div>
    </div>
  );
}
