const KEY = "donut-progress-ring";

const CYCLE = 2000;
/** Stops one step short of closing, so a gap stays open at twelve o'clock. */
const TARGET = 99;

/**
 * Donut Progress Ring — a thick stroke sweeping a matching track, with the
 * percentage centred in the hole.
 *
 * `pathLength="100"` rescales the dash units so the dash values are literal
 * percentages, independent of the radius. That means the stroke width or the
 * viewBox can change later without anyone having to recompute 2*pi*r.
 *
 * The sweep deliberately stops at 99, not 100. Closing the ring completely
 * removes the only cue for where the arc begins, and the loop's restart then
 * reads as a flicker rather than a reset — the reference has the same gap.
 */
export function DonutProgressRing() {
  return (
    <div className="relative flex w-full items-center justify-center py-5">
      <style>{`
        @property --${KEY}-v {
          syntax: "<integer>";
          initial-value: 0;
          inherits: false;
        }

        @keyframes ${KEY}-sweep {
          to { --${KEY}-v: ${TARGET}; }
        }

        .${KEY}-arc {
          --${KEY}-v: 0;
          stroke-dasharray: 100;
          stroke-dashoffset: calc(100 - var(--${KEY}-v));
          animation: ${KEY}-sweep ${CYCLE}ms var(--ease-glide) infinite;
        }

        /* One property, one clock — the readout cannot drift off the arc. */
        .${KEY}-readout {
          --${KEY}-v: 0;
          counter-reset: ${KEY}-n var(--${KEY}-v);
          animation: ${KEY}-sweep ${CYCLE}ms var(--ease-glide) infinite;
        }
        .${KEY}-readout::after { content: counter(${KEY}-n) "%"; }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-arc, .${KEY}-readout { animation: none; }
          .${KEY}-arc { --${KEY}-v: 72; }
          .${KEY}-readout { --${KEY}-v: 72; }
        }
      `}</style>

      {/* At the 32px control height the ring is far too small to hold a
          number inside it, so the readout sits beside it instead — the pairing
          reads the same and neither half has to be shrunk out of legibility. */}
      <div role="status" className="flex items-center gap-2.5">
        <span aria-hidden className="relative block size-6 shrink-0">
        <svg viewBox="0 0 48 48" fill="none" className="absolute inset-0 size-full -rotate-90">
          {/* Track is the same stroke width at low contrast, so the ring keeps
              a constant thickness whatever the arc is doing. */}
          <circle cx="24" cy="24" r="20" strokeWidth="6.5" className="stroke-white/[0.06]" />
          <circle
            cx="24"
            cy="24"
            r="20"
            pathLength="100"
            strokeWidth="6.5"
            strokeLinecap="round"
            className={`${KEY}-arc stroke-fg-secondary`}
          />
        </svg>
        </span>

        <span
          aria-hidden
          className={`${KEY}-readout text-[15px] font-semibold tabular-nums leading-none text-fg-secondary`}
        />
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
