import { TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react/ssr";

import { OrbButton } from "@/components/ui/orb-button";
import { SelectMenu } from "@/components/ui/select-menu";

const PRESETS = [
  { amount: "$5", win: "$5.75" },
  { amount: "$25", win: "$29" },
  { amount: "$100", win: "$115" },
];

/**
 * One-tap trade ticket for a short-dated NRWD direction market —
 * side pricing on top, fixed stake presets underneath.
 */
export function QuickTradePanel() {
  return (
    <div className="relative w-full max-w-[360px] rounded-2xl stroke-lit fill-panel p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#6d7cff]/90">
          <svg viewBox="0 0 24 24" className="size-5" fill="#ffffff" aria-hidden>
            <path d="M12 2.8 17.2 11.5 12 14.62 6.8 11.5 12 2.8Z" />
            <path d="M6.8 13.36 12 16.48 17.2 13.36 12 20.9 6.8 13.36Z" />
          </svg>
        </span>
        <div className="leading-tight">
          <div className="text-sm text-fg-muted">NRWD Up or Down 5m</div>
          <div className="mt-0.5 text-base font-semibold text-positive">Up</div>
        </div>
      </div>

      {/* Buy / Sell */}
      <div className="mt-4 flex items-center gap-5 border-b border-border">
        <button
          type="button"
          className="interactive -mb-px border-b-2 border-fg pb-2 text-sm font-semibold text-fg"
        >
          Buy
        </button>
        <button
          type="button"
          className="interactive -mb-px border-b-2 border-transparent pb-2 text-sm text-fg-muted hover:border-white/20 hover:text-fg-secondary"
        >
          Sell
        </button>
        <SelectMenu
          items={["1-Tap", "Confirm each", "Limit"]}
          align="end"
          className="ml-auto pb-1.5"
          triggerClassName="text-sm"
          panelClassName="text-sm"
        />
      </div>

      {/* Side pricing — the house's two-up selector, so the chosen side is the
          one carrying the orb and the other is plainly the one you did not
          pick. Two filled buttons of equal weight make a reader look twice to
          see which one is live. */}
      <div className="mt-4 flex items-center gap-1.5">
        <OrbButton label="Up 87¢" icon={TrendUpIcon} className="flex-1" />
        <OrbButton label="Down 14¢" icon={TrendDownIcon} muted className="flex-1" />
      </div>

      {/* Stake presets */}
      <div className="mt-4 text-sm text-fg">One-tap buy</div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.amount}
            type="button"
            className="hover-raise interactive grid place-items-center rounded-xl border border-border bg-white/[0.02] py-3 hover:border-white/[0.14] hover:bg-white/[0.06]"
          >
            <span className="text-lg font-semibold tabular-nums text-fg">
              {preset.amount}
            </span>
            <span className="mt-0.5">
              <span className="text-[11px] text-fg-muted">win </span>
              <span className="text-[11px] tabular-nums text-positive">
                {preset.win}
              </span>
            </span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-center text-[11px] text-fg-muted">
        By trading, you agree to the{" "}
        <button
          type="button"
          className="interactive text-fg-secondary underline underline-offset-2 hover:text-fg"
        >
          Terms of Use
        </button>
        .
      </p>
    </div>
  );
}
