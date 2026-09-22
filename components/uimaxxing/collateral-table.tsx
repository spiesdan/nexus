import { ArrowLineDownIcon, CaretUpDownIcon, DotsThreeIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";

type CollateralRow = {
  name: string;
  ticker: string;
  glyph: string;
  factor: string;
};

const ROWS: CollateralRow[] = [
  { name: "Northwind", ticker: "NRWD", glyph: "E", factor: "83.00%" },
  { name: "Wrapped Helix", ticker: "wHLX", glyph: "e", factor: "80.00%" },
  { name: "Staked Helix", ticker: "stHLX", glyph: "s", factor: "80.00%" },
  { name: "Orbit Bridged", ticker: "obORB", glyph: "cb", factor: "78.00%" },
  { name: "Tessera USD", ticker: "TSSD", glyph: "T", factor: "78.00%" },
  { name: "Circuit USD", ticker: "CIRD", glyph: "$", factor: "78.00%" },
  { name: "Wrapped Orbit", ticker: "wORB", glyph: "₿", factor: "78.00%" },
  { name: "Valid Token", ticker: "VLD", glyph: "A", factor: "76.00%" },
  { name: "Maple Token", ticker: "MPL", glyph: "L", factor: "71.00%" },
];

/** Every token mark is the system's lit orb, per the design system. */
function TokenDot({ glyph }: { glyph: string }) {
  return (
    <span
      className="bg-orb grid size-7 shrink-0 place-items-center rounded-full"
      aria-hidden="true"
    >
      <span className="text-[9px] font-bold leading-none text-white">
        {glyph}
      </span>
    </span>
  );
}

export function CollateralTable() {
  return (
    <div className="stroke-lit w-full max-w-3xl rounded-card fill-panel p-6">
      <h3 className="text-base font-semibold leading-none text-fg">
        Supported Collateral
      </h3>
      <p className="mt-2 text-xs text-fg-muted">
        Assets that can be used as collateral to borrow NRWD from this market.
      </p>

      <div className="mt-6 rounded-2xl border border-border fill-well p-4">
        {/* Column header */}
        <div className="flex h-8 items-center justify-between px-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted">
            Asset
          </span>
          <button
            type="button"
            className="interactive flex items-center gap-1.5 rounded-sm px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted hover:text-fg"
          >
            Collateral Factor
            <CaretUpDownIcon className="size-3" weight="bold"/>
          </button>
        </div>

        {/* Rows */}
        <div className="scroll-snappy snap-y-list max-h-[288px] overflow-y-auto">
        {ROWS.map((row, i) => (
          <div
            key={row.ticker}
            className={cn(
              "row-hover snap-item group flex h-12 items-center justify-between px-3 text-sm",
              i === 0
                ? "rounded-xl bg-white/[0.04]"
                : "border-t border-white/[0.05]",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <TokenDot glyph={row.glyph} />
              <span className="truncate font-medium text-fg">{row.name}</span>
              <span className="shrink-0 text-fg-muted">{row.ticker}</span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums text-fg">{row.factor}</span>
              {i === 0 ? (
                <>
                  <button
                    type="button"
                    aria-label={`Supply ${row.ticker}`}
                    className="interactive grid size-7 place-items-center rounded-full bg-white/[0.06] hover:bg-white/[0.14]"
                  >
                    <ArrowLineDownIcon
                      className="size-3.5 text-fg-secondary"
      weight="bold"/>
                  </button>
                  <button
                    type="button"
                    aria-label={`More actions for ${row.ticker}`}
                    className="interactive grid size-6 place-items-center rounded-full text-fg-muted hover:bg-white/[0.08] hover:text-fg"
                  >
                    <DotsThreeIcon className="size-4" weight="bold"/>
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
