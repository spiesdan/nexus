const KEY = "gradient-glow-button";

/**
 * Rotating gradient glow button — a static `.fill-action` pill seated inside a
 * conic gradient that orbits its edge on a 4s linear loop. Two copies of the
 * same spinning gradient run in lockstep: a crisp one clipped to a 1.5px rim,
 * and a 12px-blurred one behind it that reads as the bloom. Only the light
 * moves — the surface, label and hairline never shift, so the loop stays calm
 * enough to sit on screen forever.
 */
export function GradientGlowButton() {
  return (
    <div className="flex w-full items-center justify-center py-6">
      <style>{`
        /* One oversized square per layer: the conic is centred on the pill and
           spun with the independent rotate property, so the -50%/-50% centring
           translate survives the animation. */
        .${KEY}-ring {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 160%;
          aspect-ratio: 1;
          translate: -50% -50%;
          background: conic-gradient(
            from 0deg,
            color-mix(in oklab, var(--color-fg) 7%, transparent) 0deg,
            var(--color-accent-indigo) 58deg,
            var(--color-accent-violet) 100deg,
            var(--color-accent-peach) 148deg,
            var(--color-accent-blue) 196deg,
            color-mix(in oklab, var(--color-accent-blue) 35%, transparent) 232deg,
            color-mix(in oklab, var(--color-fg) 7%, transparent) 280deg,
            color-mix(in oklab, var(--color-fg) 7%, transparent) 360deg
          );
          animation: ${KEY}-orbit 4s linear infinite;
        }
        @keyframes ${KEY}-orbit {
          to { rotate: 360deg; }
        }
        @media (prefers-reduced-motion: reduce) {
          .${KEY}-ring { animation: none; }
        }
      `}</style>

      <button
        type="button"
        className="group relative inline-flex rounded-pill p-[1.5px] interactive"
      >
        {/* bloom: the same gradient, blurred and clipped to a slightly larger
            pill so the halo only escapes outward. Doubles on hover/focus —
            the orbit speed deliberately stays put. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-[2px] overflow-hidden rounded-pill opacity-50 blur-[12px] transition-opacity duration-200 ease-snap group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <span className={`${KEY}-ring`} />
        </span>

        {/* rim: everything but the 1.5px of padding is covered by the surface */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-pill"
        >
          <span className={`${KEY}-ring`} />
        </span>

        <span className="stroke-lit relative flex h-12 items-center rounded-pill fill-action px-9 text-[15px] font-semibold text-fg">
          Glow
        </span>
      </button>
    </div>
  );
}
