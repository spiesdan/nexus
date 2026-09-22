"use client";

import { useState } from "react";
import { CaretDownIcon, MagnifyingGlassIcon, StarIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";

const STATS: { label: string; value: string; negative?: boolean }[] = [
  { label: "Mark", value: "1.03443" },
  { label: "Oracle", value: "1.03451" },
  { label: "24h Change", value: "-2.14%", negative: true },
  { label: "24h Volume", value: "$48,215,904" },
  { label: "Open Interest", value: "$12,880,410" },
];

type MarketRow = {
  symbol: string;
  leverage: string;
  tag?: "NEW" | "SPOT";
  price: string;
  change: string;
  funding: string;
  volume: string;
  openInterest: string;
  starred: boolean;
};

const ROWS: MarketRow[] = [
  {
    symbol: "NRW-USD",
    leverage: "20×",
    tag: "NEW",
    price: "1.03443",
    change: "+1.84%",
    funding: "0.0041%",
    volume: "$48.2M",
    openInterest: "$12.9M",
    starred: true,
  },
  {
    symbol: "HLX-USD",
    leverage: "10×",
    price: "24.8071",
    change: "-2.14%",
    funding: "-0.0009%",
    volume: "$31.4M",
    openInterest: "$9.6M",
    starred: false,
  },
  {
    symbol: "ORB-USD",
    leverage: "20×",
    price: "0.48219",
    change: "+6.02%",
    funding: "0.0125%",
    volume: "$27.9M",
    openInterest: "$7.1M",
    starred: true,
  },
  {
    symbol: "VLD-USD",
    leverage: "5×",
    price: "112.640",
    change: "-0.87%",
    funding: "0.0018%",
    volume: "$19.3M",
    openInterest: "$5.4M",
    starred: false,
  },
  {
    symbol: "CIR-USD",
    leverage: "3×",
    tag: "SPOT",
    price: "7.9142",
    change: "+0.42%",
    funding: "—",
    volume: "$14.6M",
    openInterest: "—",
    starred: false,
  },
  {
    symbol: "TSS-USD",
    leverage: "10×",
    price: "0.00721",
    change: "+11.35%",
    funding: "0.0207%",
    volume: "$12.8M",
    openInterest: "$4.2M",
    starred: false,
  },
  {
    symbol: "MPL-USD",
    leverage: "20×",
    price: "3.4870",
    change: "-3.91%",
    funding: "-0.0044%",
    volume: "$9.7M",
    openInterest: "$3.8M",
    starred: false,
  },
];

const HEAD = [
  "Market",
  "Last Price",
  "24h Change",
  "Funding",
  "Volume",
  "Open Interest",
];

const GRID =
  "grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-3";

function MarketTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-negative/[0.13] px-1.5 py-[3px] text-[9px] font-semibold leading-none tracking-[0.08em] text-negative">
      {children}
    </span>
  );
}

function LeverageChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[5px] bg-white/[0.05] px-1.5 py-[3px] text-[10px] leading-none text-fg-muted">
      {children}
    </span>
  );
}

export function MarketsTable() {
  const [scope, setScope] = useState<"Strict" | "All">("Strict");
  const [starred, setStarred] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ROWS.map((r) => [r.symbol, r.starred])),
  );

  return (
    <div className="stroke-lit-tr w-full rounded-xl bg-gradient-to-r from-stage-2 to-raised-2 p-4 text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-1.5 pb-4 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold leading-none text-fg">
            NRW-USD
          </span>
          <CaretDownIcon className="size-3.5 text-fg-muted" weight="bold"/>
          <Badge variant="outline" className="ml-1">
            20×
          </Badge>
        </div>
        <div className="flex flex-wrap items-start gap-6">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1">
              <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-fg-muted">
                {stat.label}
              </span>
              <span
                className={cn(
                  "text-xs font-medium tabular-nums",
                  stat.negative ? "text-negative" : "text-fg",
                )}
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Inner panel */}
      <div className="overflow-hidden rounded-xl border border-border bg-stage-2">
        {/* MagnifyingGlassIcon + segmented control */}
        <div className="flex flex-wrap items-center gap-3 p-3">
          <label
            data-cursor-own
            className="flex h-9 flex-1 cursor-text items-center gap-2.5 rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3"
          >
            <MagnifyingGlassIcon className="size-4 shrink-0 text-fg-muted" weight="bold"/>
            <input
              type="text"
              placeholder="Search markets"
              className="w-full bg-transparent text-[13px] text-fg outline-hidden placeholder:text-fg-muted"
            />
          </label>
          <div className="flex h-9 shrink-0 items-center rounded-[10px] bg-white/[0.04] p-1">
            {(["Strict", "All"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setScope(option)}
                className={cn(
                  "h-7 rounded-[7px] px-3.5 text-xs font-medium interactive",
                  scope === option
                    ? "bg-white/[0.09] text-fg shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                    : "text-fg-muted hover:text-fg-secondary",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Category tabs */}
        {/* Seven categories run past a phone; the strip scrolls on its own. */}
        <div className="scroll-track border-b border-border px-3 pb-2.5 pt-1">
          <Tabs
            variant="pill"
            size="sm"
            className="w-max"
            defaultActive={1}
            items={[
              "Favorites",
              "All",
              "Perps",
              "Spot",
              "Crypto",
              "Trending",
              "Pre-launch",
            ]}
          />
        </div>

        {/* Six columns of numbers have no narrow arrangement, so head and rows
            share one scroll track below the search bar — which stays put. */}
        <div className="scroll-track">
        <div className="min-w-[680px]">
        {/* Table head */}
        <div className={cn(GRID, "border-b border-border px-4 py-2.5")}>
          {HEAD.map((col, i) => (
            <span
              key={col}
              className={cn(
                "text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted",
                i > 0 && "text-right",
              )}
            >
              {col}
            </span>
          ))}
        </div>

        {/* Rows */}
        <div className="py-1">
          {ROWS.map((row) => {
            const isStarred = starred[row.symbol];
            return (
              <div
                key={row.symbol}
                className={cn(GRID, "px-4 py-2.5 interactive hover:bg-white/[0.02]")}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    type="button"
                    aria-label={
                      isStarred
                        ? `Remove ${row.symbol} from favorites`
                        : `Add ${row.symbol} to favorites`
                    }
                    onClick={() =>
                      setStarred((prev) => ({
                        ...prev,
                        [row.symbol]: !prev[row.symbol],
                      }))
                    }
                    className="shrink-0"
                  >
                    <StarIcon
                      className={cn(
                        "size-3.5",
                        isStarred
                          ? "fill-negative text-negative"
                          : "text-fg-muted interactive hover:text-fg-secondary",
                      )}
      weight="bold"/>
                  </button>
                  <span className="truncate text-[13px] font-medium text-fg">
                    {row.symbol}
                  </span>
                  <LeverageChip>{row.leverage}</LeverageChip>
                  {row.tag ? <MarketTag>{row.tag}</MarketTag> : null}
                </div>
                <span className="text-right tabular-nums text-fg">
                  {row.price}
                </span>
                <span
                  className={cn(
                    "text-right tabular-nums",
                    row.change.startsWith("+") ? "text-positive" : "text-negative",
                  )}
                >
                  {row.change}
                </span>
                <span
                  className={cn(
                    "text-right tabular-nums",
                    row.funding === "—" ? "text-fg-secondary" : "text-fg",
                  )}
                >
                  {row.funding}
                </span>
                <span className="text-right tabular-nums text-fg">
                  {row.volume}
                </span>
                <span
                  className={cn(
                    "text-right tabular-nums",
                    row.openInterest === "—" ? "text-fg-secondary" : "text-fg",
                  )}
                >
                  {row.openInterest}
                </span>
              </div>
            );
          })}
        </div>
        </div>
        </div>
      </div>
    </div>
  );
}
