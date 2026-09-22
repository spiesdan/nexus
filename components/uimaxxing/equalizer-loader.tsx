const KEY = "equalizer-loader";

/** Bar geometry, in px. Width:gap is 3:1 in the reference. */
const BAR = 7;
const GAP = 2;
const MIN = 7;
const MAX = 24;
const CYCLE = 1000;

/**
 * Equalizer Bar Loader — four bars pumping between a flat dot and a tall pill.
 *
 * The bars never move horizontally; only height animates. Each is offset by a
 * quarter of the cycle, so the crest walks left to right along the row and the
 * group reads as one travelling wave rather than four blinking bars.
 *
 * Height is animated rather than scaleY because the caps must stay circular:
 * the radius is pinned at half the width, so scaling the box would squash the
 * caps into ellipses at the extremes. Four bars at 13px is cheap enough that
 * the layout cost of animating height is not worth trading the shape for.
 */
export function EqualizerLoader() {
  return (
    <div className="relative flex w-full items-center justify-center py-4">
      <style>{`
        @keyframes ${KEY}-pump {
          0%, 100% { height: ${MIN}px; }
          50%      { height: ${MAX}px; }
        }

        .${KEY}-bar {
          width: ${BAR}px;
          height: ${MIN}px;
          border-radius: ${BAR / 2}px;
          /* Symmetric ease-in-out: the bar has to decelerate into both the top
             and the bottom of its travel. The house easings are both ease-out
             curves, which would make it snap up and creep back down. */
          animation: ${KEY}-pump ${CYCLE}ms ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-bar { animation: none; }
        }
      `}</style>

      {/* Still glow. The bars own all the movement here — a drifting halo
          would read as a second, slower loader behind the first. */}
      <span
        aria-hidden
        className="pointer-events-none absolute size-10 rounded-full bg-accent-indigo/[0.06] blur-lg"
      />

      <div
        role="status"
        className="relative flex items-center"
        style={{ gap: `${GAP}px`, height: `${MAX}px` }}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden
            className={`${KEY}-bar block bg-fg-secondary`}
            // A quarter cycle apart. Negative delays start each bar already
            // mid-flight, so the wave is fully formed on the very first frame
            // instead of building up over the first second.
            style={{ animationDelay: `${-(CYCLE / 4) * i}ms` }}
          />
        ))}
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
