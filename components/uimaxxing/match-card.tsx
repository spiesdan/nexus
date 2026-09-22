import { BookmarkIcon, GiftIcon } from "@phosphor-icons/react/ssr";

import { OrbButton } from "@/components/ui/orb-button";

/**
 * Esports match market — two team lines with live odds and the house
 * two-up side selector under them.
 */
export function MatchCard() {
  return (
    <div className="hover-raise w-full max-w-[320px] rounded-2xl stroke-lit fill-panel p-4">
      {/* Team rows */}
      <div className="flex h-10 items-center gap-3 text-sm">
        <span className="grid size-7 shrink-0 place-items-center">
          <svg viewBox="0 0 24 24" className="size-5" fill="var(--color-accent-peach)" aria-hidden>
            <path d="M2.5 3h5.2l4.3 10.2L16.3 3h5.2l-7.2 18h-4.6L2.5 3Z" />
          </svg>
        </span>
        <span className="tabular-nums text-fg-muted">0</span>
        <span className="h-4 w-px bg-border" aria-hidden />
        <span className="font-medium text-fg">Vantage</span>
        <span className="ml-auto font-semibold tabular-nums text-fg">79%</span>
      </div>

      <div className="flex h-10 items-center gap-3 text-sm">
        <span className="grid size-7 shrink-0 place-items-center">
          <svg viewBox="0 0 24 24" className="size-5" fill="var(--color-fg)" aria-hidden>
            <path d="M13.6 2 4 13.4h5.6L8.4 22 20 10.2h-6.3L13.6 2Z" />
          </svg>
        </span>
        <span className="tabular-nums text-fg-muted">0</span>
        <span className="h-4 w-px bg-border" aria-hidden />
        <span className="font-medium text-fg">Zenith</span>
        <span className="ml-auto font-semibold tabular-nums text-fg">22%</span>
      </div>

      {/* Side buttons — the same two-up selector Quick Trade uses: the
          favourite carries the orb, the underdog is the muted twin. */}
      <div className="mt-3 flex items-center gap-1.5">
        {/* Names only: the odds already sit on the team rows, and "Vantage 79¢"
            wraps inside a half-width pill on a 320px card. */}
        <OrbButton label="Vantage" className="min-w-0 flex-1 whitespace-nowrap" />
        <OrbButton label="Zenith" muted className="min-w-0 flex-1 whitespace-nowrap" />
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-negative" aria-hidden />
          <span className="font-semibold text-negative">GAME 0</span>
          <span className="text-fg-muted">$376K Vol. · Arena</span>
        </div>
        <div className="flex items-center gap-3 text-fg-muted">
          <GiftIcon className="size-4" aria-hidden />
          <button type="button" aria-label="Bookmark match" className="interactive grid size-7 place-items-center rounded-full text-fg-muted hover:bg-white/[0.08] hover:text-fg size-6"><BookmarkIcon className="size-4" /></button>
        </div>
      </div>
    </div>
  );
}
