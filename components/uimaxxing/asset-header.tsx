import {
  ArrowLeftIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  DotsThreeIcon,
  InfoIcon,
} from "@phosphor-icons/react/ssr";

import { PillButton } from "@/components/ui/pill-button";

/**
 * Market detail header — asset identity, primary actions, and a hairline-split
 * row of reserve statistics.
 */
export function AssetHeader() {
  return (
    <div className="w-full max-w-3xl rounded-card stroke-lit fill-panel p-6">
      {/* Back */}
      <div className="flex items-center gap-1.5 text-xs text-fg-muted">
        <ArrowLeftIcon className="size-3.5" />
        Back
      </div>

      {/* Identity + actions */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-hairline to-raised">
            <svg viewBox="0 0 24 24" className="size-6" fill="#ffffff" aria-hidden>
              <path d="M12 2.8 17.2 11.5 12 14.62 6.8 11.5 12 2.8Z" />
              <path d="M6.8 13.36 12 16.48 17.2 13.36 12 20.9 6.8 13.36Z" />
            </svg>
          </span>
          <div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="text-xl font-semibold leading-none tracking-tight text-fg sm:text-2xl">Northwind</h3>
              <span className="text-xl leading-none tracking-tight text-fg-muted sm:text-2xl">NRWD</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs text-fg-muted">
              <span className="underline decoration-dotted underline-offset-2">Main</span>
              <span>on</span>
              <span className="underline decoration-dotted underline-offset-2">Core</span>
              <svg viewBox="0 0 24 24" className="ml-1 size-3 fill-fg-muted" aria-hidden>
                <path d="M12 2.8 17.2 11.5 12 14.62 6.8 11.5 12 2.8Z" />
                <path d="M6.8 13.36 12 16.48 17.2 13.36 12 20.9 6.8 13.36Z" />
              </svg>
              <span>Helix</span>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <PillButton variant="ghost" size="lg">
            <ArrowLineDownIcon className="size-4" />
            Deposit
          </PillButton>
          <PillButton variant="ghost" size="lg">
            <ArrowLineUpIcon className="size-4" />
            Borrow
          </PillButton>
          <span className="flex size-10 items-center justify-center rounded-full bg-white/[0.06]">
            <DotsThreeIcon className="size-4 text-fg transition-transform duration-200 ease-snap group-hover:scale-110" />
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-8 grid grid-cols-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-y-0 lg:divide-x lg:divide-border">
        <div className="pr-4 lg:px-5 lg:first:pl-0">
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            Total Deposits
            <InfoIcon className="interactive size-3 shrink-0 hover:text-fg" />
          </div>
          <div className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums text-fg sm:text-2xl">
            $70.78M
          </div>
          <div className="mt-1 text-xs tabular-nums text-fg-muted">29.09k NRWD</div>
        </div>

        <div className="pr-4 lg:px-5 lg:first:pl-0">
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            Total Borrows
            <InfoIcon className="interactive size-3 shrink-0 hover:text-fg" />
          </div>
          <div className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums text-fg sm:text-2xl">
            $319.46K
          </div>
          <div className="mt-1 text-xs tabular-nums text-fg-muted">131.31 NRWD</div>
        </div>

        <div className="pr-4 lg:px-5 lg:first:pl-0">
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            Available Liquidity
            <InfoIcon className="interactive size-3 shrink-0 hover:text-fg" />
          </div>
          <div className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums text-fg sm:text-2xl">
            $6.00M
          </div>
          <div className="mt-1 text-xs tabular-nums text-fg-muted">2.47k NRWD</div>
        </div>

        <div className="pr-4 lg:px-5 lg:first:pl-0">
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            Utilisation
            <InfoIcon className="interactive size-3 shrink-0 hover:text-fg" />
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <svg viewBox="0 0 18 18" className="size-4 shrink-0 -rotate-90" fill="none" aria-hidden>
              <circle cx="9" cy="9" r="7" strokeWidth="2.5" className="stroke-white/10" />
              <circle
                cx="9"
                cy="9"
                r="7"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="40.5 44"
                className="stroke-accent-indigo"
              />
            </svg>
            <span className="text-xl font-semibold tracking-tight tabular-nums text-fg sm:text-2xl">
              92.00%
            </span>
          </div>
        </div>

        <div className="pr-4 lg:px-5 lg:first:pl-0">
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            Liquidity Fee
            <InfoIcon className="interactive size-3 shrink-0 hover:text-fg" />
          </div>
          <div className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums text-fg sm:text-2xl">
            15.00%
          </div>
        </div>
      </div>
    </div>
  );
}
