const KEY = "cursor-glow-cta";

// The pointer is sampled by a grid of invisible hover cells laid over the
// pill — 18px wide, roughly a seventh of the 120px highlight, so the glow
// never lands more than half a cell from the real cursor.
const COLS = 20;
const ROWS = 3;

const CELLS = Array.from({ length: COLS * ROWS }, (_, i) => ({
  i,
  x: (((i % COLS) + 0.5) / COLS) * 100,
  y: ((Math.floor(i / COLS) + 0.5) / ROWS) * 100,
}));

// One rule per cell, handing the glow layer its target position. The value
// lands on a registered custom property, so the hop between two cells is
// interpolated rather than cut — that transition is what turns a coarse grid
// into a continuous trail.
const TRACKING = CELLS.map(
  (c) =>
    `.${KEY}-btn:has(.${KEY}-c${c.i}:hover) .${KEY}-field{--${KEY}-x:${c.x.toFixed(2)}%;--${KEY}-y:${c.y.toFixed(2)}%}`,
).join("\n        ");

/**
 * Cursor Glow CTA — a wide action pill lit by the pointer.
 *
 * A soft radial highlight rides under the label wherever the cursor is, and
 * the hairline picks up the same light locally, so the rim reads as brighter
 * only on the stretch nearest the pointer. Enter fades the light up in 200ms,
 * leave drops it over 300ms; at rest the position transition is slowed right
 * down so the glow cannot visibly slide back to centre while it fades out.
 *
 * No JavaScript: the hover cells and `:has()` do the sampling.
 */
export function CursorGlowCta() {
  return (
    <div className="flex w-full items-center justify-center px-4 py-8">
      <style>{`
        @property --${KEY}-x { syntax: "<percentage>"; inherits: true; initial-value: 50%; }
        @property --${KEY}-y { syntax: "<percentage>"; inherits: true; initial-value: 50%; }

        .${KEY}-btn {
          transition:
            transform 220ms var(--ease-snap),
            box-shadow 220ms var(--ease-snap);
        }
        .${KEY}-btn:hover,
        .${KEY}-btn:focus-visible {
          transform: scale(1.02);
          box-shadow:
            0 14px 34px rgba(0, 0, 0, 0.55),
            0 8px 28px -6px color-mix(in oklab, var(--color-accent-indigo) 32%, transparent),
            inset 0 1px 0 rgba(245, 245, 245, 0.11);
        }
        .${KEY}-btn:active {
          transform: scale(0.98);
          transition-duration: 110ms;
        }

        .${KEY}-field {
          opacity: 0;
          transition-property: opacity, --${KEY}-x, --${KEY}-y;
          transition-duration: 300ms, 700ms, 700ms;
          transition-timing-function: var(--ease-glide), var(--ease-glide), var(--ease-glide);
        }
        .${KEY}-btn:hover .${KEY}-field,
        .${KEY}-btn:focus-visible .${KEY}-field {
          opacity: 1;
          transition-duration: 200ms, 170ms, 170ms;
          transition-timing-function: var(--ease-glide), var(--ease-snap), var(--ease-snap);
        }

        /* ~120px of core light over a wider, much fainter bloom. */
        .${KEY}-glow {
          background:
            radial-gradient(
              circle 74px at var(--${KEY}-x) var(--${KEY}-y),
              color-mix(in oklab, var(--color-accent-violet) 46%, transparent) 0%,
              color-mix(in oklab, var(--color-accent-indigo) 24%, transparent) 44%,
              transparent 78%
            ),
            radial-gradient(
              circle 150px at var(--${KEY}-x) var(--${KEY}-y),
              color-mix(in oklab, var(--color-accent-indigo) 11%, transparent) 0%,
              transparent 70%
            );
        }

        /* Same light, clipped to a 1px rim — the local border brightening. */
        .${KEY}-rim {
          padding: 1px;
          background: radial-gradient(
            circle 86px at var(--${KEY}-x) var(--${KEY}-y),
            color-mix(in oklab, var(--color-fg) 60%, transparent) 0%,
            color-mix(in oklab, var(--color-accent-indigo) 38%, transparent) 44%,
            transparent 80%
          );
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          mask-composite: exclude;
        }

        ${TRACKING}

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-btn,
          .${KEY}-btn:hover,
          .${KEY}-btn:focus-visible,
          .${KEY}-btn:active {
            transform: none;
            transition: box-shadow 220ms var(--ease-snap);
          }
        }
      `}</style>

      {/* `.interactive` is deliberately left off: it would press to 0.975 and
          fight the 1.02 / 0.98 pair the reference actually plays, so the pill
          carries its own hover/press transition on the same house easing. */}
      <button
        type="button"
        className={`${KEY}-btn stroke-lit fill-action relative isolate h-14 w-full max-w-[360px] rounded-card text-[15px] font-semibold tracking-[-0.01em] text-fg`}
      >
        {/* the travelling light, under the label */}
        <span
          aria-hidden
          className={`${KEY}-field pointer-events-none absolute inset-0 z-0 rounded-[inherit]`}
        >
          <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
            <span className={`${KEY}-glow absolute inset-0`} />
          </span>
          <span className={`${KEY}-rim absolute inset-0 rounded-[inherit]`} />
        </span>

        <span className="relative z-10">Get moving</span>

        {/* Sampling grid, above the label so the text never shadows a cell.
            Clipped to the pill radius so the corners stay outside the
            hover region, as they would be on the button itself. */}
        <span
          aria-hidden
          className="absolute inset-0 z-20 grid overflow-hidden rounded-[inherit]"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          }}
        >
          {CELLS.map((c) => (
            <span key={c.i} className={`${KEY}-c${c.i}`} />
          ))}
        </span>
      </button>
    </div>
  );
}
