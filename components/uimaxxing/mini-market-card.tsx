import { BookmarkIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react/ssr";

import { OrbButton } from "@/components/ui/orb-button";

/** Semicircle sweep: π × r where r = 19. */
const ARC_LENGTH = 59.69;
const FILLED = ARC_LENGTH * 0.51;

// Class and keyframe names are prefixed with the file slug so the rules stay
// scoped to this component.
const KEY = "mini-market";

// One tip's life: rises in from a few px below, holds, and lifts away. The six
// tips share the cycle at staggered negative delays so there is always one
// arriving and one leaving — a trickle, not a pulse. Delays are hardcoded so
// the server and the client agree on them.
const TIP_MS = 3600;
const TIP_DELAYS = [0, -1300, -600, -2500, -1900, -3100] as const;

const tip = (i: number) => ({ animationDelay: `${TIP_DELAYS[i]}ms` });

/**
 * Compact 5-minute up/down market — half-donut odds gauge and the house
 * two-up side selector, with live tip amounts floating over the pills.
 */
export function MiniMarketCard() {
  return (
    <div className="hover-raise w-full max-w-[320px] rounded-2xl stroke-lit fill-panel p-4">
      <style>{`
        @keyframes ${KEY}-tip {
          0%        { opacity: 0; transform: translateY(4px); }
          18%, 62%  { opacity: 1; transform: translateY(0); }
          100%      { opacity: 0; transform: translateY(-5px); }
        }
        .${KEY}-tip {
          display: inline-block;
          animation: ${KEY}-tip ${TIP_MS}ms var(--ease-glide) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .${KEY}-tip { animation: none; }
        }
      `}</style>
      {/* Market header */}
      <div className="flex items-start gap-3">
        <span className="bg-orb grid size-11 shrink-0 place-items-center rounded-xl">
          <span className="text-lg font-bold leading-none text-white">O</span>
        </span>

        <h3 className="mt-1 text-sm font-semibold text-fg underline decoration-white/20 underline-offset-4">
          ORB Up or Down 5m
        </h3>

        <div className="ml-auto shrink-0">
          <svg viewBox="0 0 48 26" fill="none" aria-hidden className="h-6 w-12">
            <path
              d="M5 24A19 19 0 0 1 43 24"
              stroke="var(--color-border)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M5 24A19 19 0 0 1 43 24"
              stroke="var(--color-positive)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${FILLED} ${ARC_LENGTH}`}
            />
          </svg>
          <div className="mt-1 flex flex-col items-center leading-none">
            <span className="text-sm font-semibold text-fg tabular-nums">51%</span>
            <span className="mt-1 text-[10px] text-fg-muted">Up</span>
          </div>
        </div>
      </div>

      {/* Incoming tips drifting above the side bets */}
      <div className="mt-3 flex h-4 items-end justify-between gap-2 leading-none">
        <span className={`${KEY}-tip text-[11px] text-positive/70 tabular-nums`} style={tip(0)}>+ $4</span>
        <span className={`${KEY}-tip text-[11px] text-negative/70 tabular-nums`} style={tip(1)}>+ $10</span>
      </div>

      {/* Side bets — the same two-up selector Quick Trade uses: the favoured
          side carries the orb, the other is plainly the one not picked. The
          pills are too tight on a 320px card to also carry the floating tips,
          so those drift in the row above and settle in the row below. */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <OrbButton label="Up 51¢" icon={TrendUpIcon} className="min-w-0 flex-1 whitespace-nowrap" />
        <OrbButton label="Down 49¢" icon={TrendDownIcon} muted className="min-w-0 flex-1 whitespace-nowrap" />
      </div>
      <div className="mt-1.5 flex justify-between leading-none">
        <span className="flex gap-2 text-[11px] tabular-nums">
          <span className={`${KEY}-tip text-positive/80`} style={tip(2)}>+ $3</span>
          <span className={`${KEY}-tip text-positive/50`} style={tip(3)}>+ $2</span>
        </span>
        <span className="flex gap-2 text-[11px] tabular-nums">
          <span className={`${KEY}-tip text-negative/50`} style={tip(4)}>+ $3</span>
          <span className={`${KEY}-tip text-negative/80`} style={tip(5)}>+ $20</span>
        </span>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-negative" aria-hidden />
          <span className="text-[11px] font-semibold text-negative">LIVE</span>
          <span className="text-[11px] text-fg-muted">· Orbit</span>
        </div>
        <button type="button" aria-label="Bookmark market" className="interactive grid size-7 place-items-center rounded-full text-fg-muted hover:bg-white/[0.08] hover:text-fg size-6"><BookmarkIcon className="size-4" /></button>
      </div>
    </div>
  );
}
