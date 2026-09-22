const KEY = "arc-spinner";

/**
 * Arc Spinner Ring — a thin ring carrying one bright arc that rotates forever
 * while its own length breathes.
 *
 * The trick is that the two loops are deliberately mismatched: the ring turns
 * on a flat 1400ms linear rotation, and the arc grows and shrinks on a 2000ms
 * ease-in-out of its own. 7:10 means they only realign every 14 seconds, so
 * the arc is never caught at the same length in the same place twice running
 * and the loop never reads as a repeating stamp. Locking them to one period —
 * or worse, one animation — collapses it into an obvious 1.4s cycle.
 *
 * Only `stroke-dasharray` moves. The dash start stays pinned to the ring, so
 * the arc opens and closes from one end while the rotation supplies all of the
 * travel; the stroke width and the caps never change, which is what keeps the
 * arc reading as one continuous filament rather than a shape that is being
 * redrawn.
 */
export function ArcSpinner() {
  return (
    <div className="relative flex w-full items-center justify-center py-4">
      <style>{`
        @keyframes ${KEY}-spin {
          to { transform: rotate(360deg); }
        }

        /* pathLength="100" on the circle rescales the dash units, so these
           values are literal percentages of the circumference. */
        @keyframes ${KEY}-breathe {
          0%, 100% { stroke-dasharray: 25 75; }
          50%      { stroke-dasharray: 74 26; }
        }

        /* The animation rides a wrapper span rather than the <svg> itself —
           several engines skip GPU acceleration for transforms on an SVG root,
           and this loop never stops. Linear: any easing here would give the
           rotation a beat, and the arc already owns the only rhythm. */
        .${KEY}-ring {
          animation: ${KEY}-spin 1400ms linear infinite;
          will-change: transform;
        }

        .${KEY}-arc {
          /* Also the resting value, so a reduced-motion viewer still gets a
             quarter arc rather than a bare circle. */
          stroke-dasharray: 25 75;
          /* Both house easings are ease-out curves. A length that opens and
             closes on the same curve needs a symmetric one, otherwise the arc
             snaps open and creeps shut — so this single loop uses a plain
             ease-in-out. Every other timing in the file stays on the system. */
          animation: ${KEY}-breathe 2000ms ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-ring,
          .${KEY}-arc { animation: none; }
        }
      `}</style>

      {/* Glow ornament, deliberately still — the rotation is the only movement
          this component should have, and a drifting halo would read as a
          second, slower spinner behind the first. */}
      <span
        aria-hidden
        className="pointer-events-none absolute size-10 rounded-full bg-accent-indigo/[0.06] blur-lg"
      />

      <div role="status" className="relative grid place-items-center">
        <span aria-hidden className={`${KEY}-ring block size-6`}>
          <svg viewBox="0 0 48 48" fill="none" className="size-full -rotate-90">
            {/* Track at a flat white-alpha hairline — present enough to close
                the circle, dim enough that the arc stays the only figure. */}
            <circle cx="24" cy="24" r="21" strokeWidth="3.6" className="stroke-white/[0.07]" />
            <circle
              cx="24"
              cy="24"
              r="21"
              pathLength="100"
              strokeWidth="3.6"
              strokeLinecap="round"
              className={`${KEY}-arc stroke-fg-secondary`}
            />
          </svg>
        </span>
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
