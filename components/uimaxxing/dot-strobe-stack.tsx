import { DotMatrix } from "@/components/ui/dot-matrix";

/** Animation-name prefix — keeps these keyframes off the shared sheet. */
const KEY = "dot-strobe-stack";

/** Fill, settle, strobe-out and one empty beat: ten frames of the reference. */
const CYCLE = 1440;

/** Gap between neighbouring diagonals in either wipe — exactly 5% of CYCLE. */
const STEP = 5;

/** Level a dot holds once the fill front has passed it. */
const LIT = 0.5;

const ROWS = [0, 1, 2, 3, 4];

/**
 * One row's track, in percent of the cycle.
 *
 * Both fronts advance one step per column, so `x` is a plain animation-delay
 * and the row is the only thing that reshapes the track: the fill front runs
 * parallel to the main diagonal (so it reaches low rows first) and the strobe
 * front parallel to the anti-diagonal (so it reaches low rows last). The two
 * events therefore walk apart as you go down the field — 502ms between them on
 * the top row, 1078ms on the bottom — which is why this cannot be one shared
 * keyframe set with a cleverer delay.
 */
function rowTrack(y: number) {
  const fill = 22 - STEP * y;
  const wipe = 55 + STEP * y;
  return `
        @keyframes ${KEY}-row-${y} {
          ${fill > 2 ? `0%, ${fill - 2}%` : "0%"} {
            opacity: var(--dot-rest);
            animation-timing-function: var(--ease-snap);
          }
          ${fill}% { opacity: 1; animation-timing-function: var(--ease-glide); }
          ${fill + 6}%, ${wipe - 2}% {
            opacity: ${LIT};
            animation-timing-function: var(--ease-snap);
          }
          ${wipe}% { opacity: 1; animation-timing-function: var(--ease-glide); }
          ${wipe + 8}%, 100% { opacity: var(--dot-rest); }
        }`;
}

/**
 * Dot strobe stack — the field fills on a 45° wipe travelling up and to the
 * right, sits at half strength for a beat, then a second wipe running down and
 * to the right strobes it back out, one diagonal at a time. Every dot flashes
 * to full white on the two frames it is crossed, and the field is completely
 * dark for the last beat before the next fill starts.
 *
 * The two wipes are perpendicular, not a there-and-back of the same sweep:
 * measured off the strip the fill fronts are lines of constant `x - y` and the
 * strobe fronts lines of constant `x + y`. That is the whole character of the
 * thing — the field stacks up one way and comes apart across it — so it is
 * worth the five keyframe sets it costs.
 *
 * The mid-hold sag lives on the grid rather than in the dot tracks. It is
 * global in the reference (every dot dims together, 0.5 → 0.36 → 0.5), and
 * folding it into the per-dot tracks would smear it across the four columns of
 * delay into a slow ripple. Container opacity multiplies the whole field at
 * once and keeps it a single breath.
 *
 * Nothing scales: bright, half-lit and resting dots all measure the same width
 * on the reference frames, so this is an opacity-only animation.
 */
export function DotStrobeStack() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="relative flex w-full items-center justify-center py-6"
    >
      <style>{`
        .${KEY} {
          animation: ${KEY}-sag ${CYCLE}ms var(--ease-glide) infinite;
        }

        .${KEY} .dot-matrix-dot {
          animation-duration: ${CYCLE}ms;
          /* Linear between stops on purpose — the stops are the measurement.
             Arrivals and snaps get the house curves inside the tracks. */
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          /* A whole cycle of negative delay so the pattern is already mid-wipe
             on the first painted frame instead of starting from a dead field. */
          animation-delay: calc(var(--x) * ${(CYCLE * STEP) / 100}ms - ${CYCLE}ms);
        }

        ${ROWS.map(
          (y) => `.${KEY} [data-y="${y}"] { animation-name: ${KEY}-row-${y}; }`,
        ).join("\n        ")}
        ${ROWS.map(rowTrack).join("\n")}

        @keyframes ${KEY}-sag {
          0%, 36%   { opacity: 1; }
          42%, 50%  { opacity: 0.73; }
          56%, 100% { opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .${KEY} { animation: none; }
          /* Frozen on the filled beat, not on the empty one — a field of dead
             dots would read as a broken component rather than a paused one. */
          .${KEY} .dot-matrix-dot { animation: none; opacity: ${LIT}; }
        }
      `}</style>

      <DotMatrix className={KEY} />
    </div>
  );
}
