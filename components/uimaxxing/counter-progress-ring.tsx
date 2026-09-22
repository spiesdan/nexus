const KEY = "counter-progress-ring";

const CYCLE = 2000;
/** Asymptotes one step short, leaving a ~4deg gap at twelve o'clock. */
const TARGET = 99;

/**
 * Counter Progress Ring — a thin butt-capped ring around a large percentage
 * counter, sweeping 0 to 99 on a loop.
 *
 * The thin variant of the donut: same single-clock construction, but the type
 * is the figure and the ring is the frame, so the stroke drops to a hairline
 * and the caps are butt rather than round — a round cap on a 2px stroke reads
 * as a bulge at this size, and it would also close the twelve o'clock gap the
 * loop needs to stay legible.
 *
 * The counter is typed through `@property` so it interpolates rather than
 * jumping between keyframes, then rendered with `counter()`. `tabular-nums`
 * keeps the digits from shifting as the value widens from one to two.
 */
export function CounterProgressRing() {
  return (
    <div className="relative flex w-full items-center justify-center py-6">
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

        .${KEY}-readout {
          --${KEY}-v: 0;
          counter-reset: ${KEY}-n var(--${KEY}-v);
          animation: ${KEY}-sweep ${CYCLE}ms var(--ease-glide) infinite;
        }
        .${KEY}-readout::after { content: counter(${KEY}-n); }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-arc, .${KEY}-readout { animation: none; }
          .${KEY}-arc { --${KEY}-v: 81; }
          .${KEY}-readout { --${KEY}-v: 81; }
        }
      `}</style>

      {/* At the 32px control height the ring cannot hold the counter inside
          it, so the number sits beside the ring — still one clock driving
          both, just laid out end to end instead of concentrically. */}
      <div role="status" className="flex items-center gap-2.5">
        <span aria-hidden className="relative block size-6 shrink-0">
        <svg viewBox="0 0 48 48" fill="none" className="absolute inset-0 size-full -rotate-90">
          <circle cx="24" cy="24" r="22" strokeWidth="2.8" className="stroke-white/[0.07]" />
          <circle
            cx="24"
            cy="24"
            r="22"
            pathLength="100"
            strokeWidth="2.8"
            className={`${KEY}-arc stroke-fg-secondary`}
          />
        </svg>
        </span>

        <span
          aria-hidden
          className={`${KEY}-readout text-[15px] font-semibold tabular-nums leading-none tracking-tight text-fg-secondary`}
        />
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
