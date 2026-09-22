const KEY = "pie-success-loader";

// One loop, in milliseconds — every track below is the same duration so the
// phases stay locked to each other without a single delay to keep in sync.
const CYCLE = 3600;

// Circumference of the pie's construction circle (r = 10). The sector is a
// stroke, not a wedge path: a circle at half the radius carrying a stroke as
// wide as the radius paints solid from centre to rim, so one animatable
// stroke-dashoffset gives a true centre-anchored sweep with no JS and no
// angle-typed custom property.
const PIE_ARC = 62.84;

// Slightly longer than the checkmark path (~24.8) so the fully-offset state is
// unambiguously blank, with no stray pixel at either cap.
const CHECK_LEN = 26;

/**
 * Pie sweep success loader — a 40px hairline track that fills clockwise from
 * 12 o'clock, pops, and resolves into a filled disc with a checkmark.
 *
 * The reference is monochrome: a dark pie on light. Inverted onto the house
 * stage that becomes a bright disc with the check knocked out in the page
 * colour, which keeps the two-tone reading of the source without borrowing
 * any of its palette.
 *
 * Phases (of 3600ms): empty track holds 400ms · sweep 0→360° over 1200ms
 * ease-in-out · pop to 1.08 and settle · check draws over 260ms · success
 * holds, then the fill dissolves and the bare track is exposed again for the
 * next pass. The reset rides an opacity track rather than a reverse sweep so
 * the loop never runs the pie backwards.
 */
export function PieSuccessLoader() {
  return (
    <div
      role="img"
      aria-label="Progress ring filling, then completing with a success check"
      className="flex w-full flex-col items-center gap-2 py-2"
    >
      <style>{`
        /* Resting values are the RESOLVED state, so the reduced-motion
           fallback below lands on a meaningful frame — a finished check —
           rather than an empty ring that would read as stalled. */
        .${KEY}-pie,
        .${KEY}-check { stroke-dashoffset: 0; }
        .${KEY}-glow { opacity: 1; }
        .${KEY}-label-run { opacity: 0; }
        .${KEY}-label-done { opacity: 1; }

        .${KEY}-pie {
          animation: ${KEY}-sweep ${CYCLE}ms ease-in-out infinite;
        }
        .${KEY}-check {
          animation: ${KEY}-draw ${CYCLE}ms var(--ease-glide) infinite;
        }
        .${KEY}-badge {
          animation: ${KEY}-pop ${CYCLE}ms var(--ease-snap) infinite;
          will-change: transform;
        }
        .${KEY}-fill {
          animation: ${KEY}-dissolve ${CYCLE}ms linear infinite;
          will-change: opacity;
        }
        .${KEY}-glow {
          animation: ${KEY}-halo ${CYCLE}ms var(--ease-snap) infinite;
        }
        .${KEY}-label-run {
          animation: ${KEY}-run ${CYCLE}ms var(--ease-glide) infinite;
        }
        .${KEY}-label-done {
          animation: ${KEY}-done ${CYCLE}ms var(--ease-glide) infinite;
        }

        /* 11.11% = 400ms of empty track; 44.44% = 1600ms, sweep complete. */
        @keyframes ${KEY}-sweep {
          0%, 11.11%   { stroke-dashoffset: ${PIE_ARC}; }
          44.44%, 100% { stroke-dashoffset: 0; }
        }

        /* The confirming pop, straight off the last full-disc frame. The dip
           under 1.0 is what makes it read as a landing rather than a zoom. */
        @keyframes ${KEY}-pop {
          0%, 44.44%   { transform: scale(1); }
          47.78%       { transform: scale(1.08); }
          51.11%       { transform: scale(0.988); }
          52.78%, 100% { transform: scale(1); }
        }

        /* Starts inside the pop's settle (48.89% = 1760ms) so the stroke is
           already travelling as the disc lands — the two beats overlap by a
           frame or two instead of queueing. */
        @keyframes ${KEY}-draw {
          0%, 48.89%   { stroke-dashoffset: ${CHECK_LEN}; }
          56.11%, 100% { stroke-dashoffset: 0; }
        }

        /* Success holds to 3300ms, then the whole fill group leaves together
           and the hairline track underneath is what remains. */
        @keyframes ${KEY}-dissolve {
          0%, 91.67%   { opacity: 1; }
          95.83%, 100% { opacity: 0; }
        }

        @keyframes ${KEY}-halo {
          0%, 44.44%   { opacity: 0; transform: scale(0.86); }
          52.78%       { opacity: 1; transform: scale(1); }
          88.89%       { opacity: 1; transform: scale(1); }
          95.83%, 100% { opacity: 0; transform: scale(1); }
        }

        @keyframes ${KEY}-run {
          0%, 41.67%     { opacity: 1; }
          47.22%, 93.06% { opacity: 0; }
          100%           { opacity: 1; }
        }

        @keyframes ${KEY}-done {
          0%, 48.89%     { opacity: 0; transform: translate3d(0, 3px, 0); }
          56.11%, 91.67% { opacity: 1; transform: translate3d(0, 0, 0); }
          95.83%, 100%   { opacity: 0; transform: translate3d(0, 0, 0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-pie,
          .${KEY}-check,
          .${KEY}-badge,
          .${KEY}-fill,
          .${KEY}-glow,
          .${KEY}-label-run,
          .${KEY}-label-done { animation: none; transform: none; }
        }
      `}</style>

      <div className="grid place-items-center">
        {/* Glow ornament — lights only for the success beat, so the halo is
            the confirmation and not ambient decoration. */}
        <span
          aria-hidden
          className={`${KEY}-glow col-start-1 row-start-1 size-8 rounded-full bg-accent-indigo/[0.14] blur-lg`}
        />

        <div aria-hidden className={`${KEY}-badge col-start-1 row-start-1`}>
          <svg viewBox="0 0 48 48" className="block size-6">
            {/* Track: outer edge at r=20, so the filled disc lands flush with
                it and the hairline disappears under a completed sweep. */}
            <circle
              cx="24"
              cy="24"
              r="19.5"
              fill="none"
              strokeWidth="1.6"
              className="stroke-white/10"
            />

            <g className={`${KEY}-fill`}>
              <circle
                className={`${KEY}-pie stroke-fg-secondary`}
                cx="24"
                cy="24"
                r="10"
                fill="none"
                strokeWidth="20"
                strokeDasharray={PIE_ARC}
                /* SVG arcs start at 3 o'clock; the quarter-turn puts the
                   sector's leading edge at 12, sweeping clockwise. */
                transform="rotate(-90 24 24)"
              />
              <path
                className={`${KEY}-check stroke-bg`}
                d="M15.6 24.5 L21.3 30.2 L32.8 18"
                fill="none"
                strokeWidth="4.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={CHECK_LEN}
              />
            </g>
          </svg>
        </div>
      </div>

      {/* Both captions occupy one grid cell, so the crossfade cannot shift the
          layout under the badge. */}
      <div aria-hidden className="grid place-items-center text-[11px] leading-none">
        <span className={`${KEY}-label-run col-start-1 row-start-1 text-fg-muted`}>
          Processing
        </span>
        <span
          className={`${KEY}-label-done col-start-1 row-start-1 font-medium text-fg`}
        >
          Complete
        </span>
      </div>
    </div>
  );
}
