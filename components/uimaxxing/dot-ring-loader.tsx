const KEY = "dot-ring-loader";

/** Eight dots at 45° — the count measured off the reference frames. */
const DOTS = 8;

/** One full trip of the highlight around the ring. */
const CYCLE = 1000;

/**
 * Dot ring loader — eight dots on a fixed orbit, brightest at the head and
 * ramping down to the tail, so the bright point appears to travel once per
 * second.
 *
 * The ring never moves. Frame-by-frame the reference holds every dot at a
 * fixed angle and radius and animates only opacity (1 → 0.15) and scale
 * (1.35 → 1); rotating the ring instead would be invisible anyway at 8-fold
 * symmetry, and would stop the highlight from reading as a travelling head.
 *
 * The decay is deliberately **linear** across 88% of the cycle. Sampling the
 * reference gives a monotone ramp around the circle — each dot a fixed step
 * dimmer than the one ahead of it — and per-segment house easing would break
 * that even ramp into visible stairs. The house curves are spent where they
 * are actually felt: the 120ms flash where the tail dot becomes the new head
 * rides `ease-glide` past the peak to 1.44, then `ease-snap` settles it back
 * onto 1.35. That overshoot is what keeps the head reading as a pop rather
 * than a crossfade.
 */
export function DotRingLoader() {
  return (
    <div className="relative flex w-full items-center justify-center py-6">
      <style>{`
        .${KEY}-dot {
          animation: ${KEY}-pulse ${CYCLE}ms linear infinite;
          will-change: transform, opacity;
          /* Bloom rather than a second animated layer: the shadow rides the
             dot's own opacity, so only the bright end of the ramp glows. */
          box-shadow: 0 0 5px color-mix(in oklab, var(--color-accent-indigo) 28%, transparent);
        }

        @keyframes ${KEY}-pulse {
          /* Head: full strength, and the only moment a dot is at 1.35. */
          0% { opacity: 1; transform: scale(1.35); }
          /* Tail, one step behind the head. Everything between is the ramp. */
          88% {
            opacity: 0.15;
            transform: scale(1);
            animation-timing-function: var(--ease-glide);
          }
          /* The flash — overshoots the peak on the way in. */
          96% {
            opacity: 0.95;
            transform: scale(1.44);
            animation-timing-function: var(--ease-snap);
          }
          100% { opacity: 1; transform: scale(1.35); }
        }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-dot { animation: none; opacity: 0.26; transform: none; }
          /* Frozen on one frame of the loop rather than a flat dead ring — the
             head still says which way the thing was pointing. */
          .${KEY}-head { opacity: 1; transform: scale(1.3); }
        }
      `}</style>

      {/* Glow ornament, deliberately static: a breathing halo would add a
          second rhythm competing with the one that carries the meaning. */}
      <span
        aria-hidden
        className="pointer-events-none absolute size-10 rounded-full bg-accent-indigo/[0.07] blur-lg"
      />

      <div role="status" aria-label="Loading" className="relative size-6">
        {Array.from({ length: DOTS }, (_, i) => (
          // Each spoke is the full square rotated about its centre, so the dot
          // it holds at top-centre lands on the orbit with no per-dot maths —
          // and the dot's own transform is left free for the scale.
          <span
            key={i}
            aria-hidden
            className="absolute inset-0 flex items-start justify-center"
            style={{ transform: `rotate(${(i * 360) / DOTS}deg)` }}
          >
            <span
              className={`${KEY}-dot ${i === 0 ? `${KEY}-head` : ""} size-[4px] rounded-full bg-fg-secondary`}
              // Negative throughout, so the ramp is already populated on the
              // first painted frame instead of lighting up dot by dot.
              style={{ animationDelay: `${(i * CYCLE) / DOTS - CYCLE}ms` }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
