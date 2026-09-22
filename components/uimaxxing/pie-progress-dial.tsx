const KEY = "pie-progress-dial";

/** One full sweep. The readout shares this exactly so the two stay locked. */
const CYCLE = 2000;

/**
 * Pie Progress Dial — a solid sector sweeping from twelve o'clock round to a
 * full disc, with a percentage readout beneath it.
 *
 * Both the sector and the number are driven by a single registered custom
 * property. `@property` is what makes that possible: an unregistered custom
 * property has no type, so the browser can only flip it discretely at each
 * keyframe. Typing it as a percentage lets it genuinely interpolate, which
 * means one animation can feed both the conic-gradient stop and the counter —
 * and they cannot drift apart, because there is only one clock.
 *
 * The easing is `ease-glide`, the house reveal curve: it covers most of the
 * dial early then crawls through the last fifth, which is the asymmetry the
 * reference has and a linear sweep loses.
 */
export function PieProgressDial() {
  return (
    <div className="relative flex w-full flex-col items-center justify-center gap-2 py-4">
      <style>{`
        @property --${KEY}-v {
          syntax: "<integer>";
          initial-value: 0;
          inherits: false;
        }

        @keyframes ${KEY}-sweep {
          to { --${KEY}-v: 100; }
        }

        .${KEY}-dial {
          --${KEY}-v: 0;
          background: conic-gradient(
            /* Secondary, not primary: at 88px the sector is the largest
               solid area in the whole section, and at var(--color-fg) it blew past
               everything around it. */
            var(--color-fg-secondary) calc(var(--${KEY}-v) * 1%),
            transparent 0
          );
          animation: ${KEY}-sweep ${CYCLE}ms var(--ease-glide) infinite;
        }

        /* Same property, same clock — the number cannot lag the sector. */
        .${KEY}-readout {
          --${KEY}-v: 0;
          counter-reset: ${KEY}-n var(--${KEY}-v);
          animation: ${KEY}-sweep ${CYCLE}ms var(--ease-glide) infinite;
        }
        .${KEY}-readout::after {
          content: counter(${KEY}-n) "%";
        }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-dial, .${KEY}-readout { animation: none; }
          .${KEY}-dial { --${KEY}-v: 68; }
          .${KEY}-readout { --${KEY}-v: 68; }
        }
      `}</style>

      <div role="status" className="relative grid size-6 place-items-center">
        {/* Unfilled remainder. A flat disc rather than a second gradient, so
            the sector always has the same ground to read against. */}
        <span aria-hidden className="absolute inset-0 rounded-full bg-white/[0.05]" />
        <span aria-hidden className={`${KEY}-dial absolute inset-0 rounded-full`} />
        {/* Hairline over the top edge, so the disc keeps a defined rim once
            the sector reaches full and the two fills meet. */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/[0.08]"
        />
        <span className="sr-only">Loading</span>
      </div>

      <span
        aria-hidden
        className={`${KEY}-readout text-[13px] font-semibold tabular-nums leading-none text-fg-secondary`}
      />
    </div>
  );
}
