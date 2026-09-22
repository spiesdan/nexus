"use client";

import { CreditCardIcon, ShoppingCartIcon } from "@phosphor-icons/react/ssr";
import { useState } from "react";

// Class names are prefixed with the file slug so the rules below stay scoped
// to this component and never collide with the shared sheet.
const KEY = "cart-split";

/**
 * The cart CTA that folds three chips into one pill. Split, it is a 36px
 * payment chip, cart sphere and item count on a 38px pitch (112px of run).
 * Clicking merges: the outer two slide back under the sphere while it stretches
 * — 36 → past 128 → settling at 124 on a back-out curve, so the pill springs
 * about 4px past its target the way the reference does — the body flattens
 * 36 → 34px, and "View cart" fades up from 30% in the space that just opened.
 * Clicking again reverses it in 150ms.
 *
 * Everything is centred on the button's midline, so the group never drifts
 * sideways while the geometry changes underneath it.
 */
export function CartSplitButton() {
  const [merged, setMerged] = useState(false);

  return (
    <div className="flex w-full items-center justify-center py-6">
      <style>{`
        .${KEY}-pill {
          /* Split: a 36px sphere. 10px of lead padding puts the 16px glyph
             dead centre; at 12px on the merged pill it parks at a 20px inset. */
          transform: translate(-50%, -50%);
          width: 36px;
          height: 36px;
          padding-left: 10px;
          transition:
            width 150ms var(--ease-snap),
            height 150ms var(--ease-snap),
            padding-left 150ms var(--ease-snap),
            filter 200ms var(--ease-snap);
        }
        .${KEY}-root[data-merged="true"] .${KEY}-pill {
          width: 124px;
          height: 34px;
          padding-left: 12px;
          /* The y-overshoot on this curve peaks ~5% over the 88px of travel,
             which lands the crest at 128px before it falls back to 124. */
          transition:
            width 340ms cubic-bezier(0.2, 1.4, 0.4, 1),
            height 190ms var(--ease-snap),
            padding-left 260ms var(--ease-glide),
            filter 200ms var(--ease-snap);
        }

        /* The outer chips ride under the pill (z-0), so merging reads as the
           sphere swallowing them rather than three things fading out. */
        .${KEY}-chip {
          transition:
            transform 170ms var(--ease-snap),
            opacity 130ms var(--ease-snap) 40ms;
        }
        .${KEY}-chip-l { transform: translate(-50%, -50%) translateX(-38px); }
        .${KEY}-chip-r { transform: translate(-50%, -50%) translateX(38px); }
        .${KEY}-root[data-merged="true"] .${KEY}-chip {
          opacity: 0;
          transition:
            transform 200ms var(--ease-snap),
            opacity 150ms var(--ease-snap);
        }
        .${KEY}-root[data-merged="true"] .${KEY}-chip-l,
        .${KEY}-root[data-merged="true"] .${KEY}-chip-r {
          transform: translate(-50%, -50%) translateX(0) scale(0.72);
        }

        /* Held at 30% under the clip while split, so the reveal is a fade-up
           into open space rather than an entrance from nothing. */
        .${KEY}-label {
          opacity: 0.3;
          transition: opacity 90ms var(--ease-snap);
        }
        .${KEY}-root[data-merged="true"] .${KEY}-label {
          opacity: 1;
          transition: opacity 220ms var(--ease-glide) 140ms;
        }

        .${KEY}-glow {
          opacity: 0.45;
          transition: opacity 180ms var(--ease-snap);
        }
        .${KEY}-root[data-merged="true"] .${KEY}-glow {
          opacity: 0.85;
          transition-duration: 320ms;
        }

        /* [data-merged] matches either state, so these out-rank the merged
           rules above on specificity and order. */
        @media (prefers-reduced-motion: reduce) {
          .${KEY}-root[data-merged] .${KEY}-pill,
          .${KEY}-root[data-merged] .${KEY}-chip,
          .${KEY}-root[data-merged] .${KEY}-label,
          .${KEY}-root[data-merged] .${KEY}-glow {
            transition: none;
          }
        }
      `}</style>

      <button
        type="button"
        aria-label="View cart, 3 items"
        data-merged={merged}
        onClick={() => setMerged((v) => !v)}
        className={`${KEY}-root group interactive relative h-9 w-[136px] rounded-pill focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-accent-indigo`}
      >
        {/* Glow ornament — its own filter-free wrapper carries the drift. */}
        <span aria-hidden className="animate-drift absolute inset-0">
          <span
            className={`${KEY}-glow absolute left-1/2 top-1/2 h-6 w-[116px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-accent-indigo/30 blur-xl`}
          />
        </span>

        {/* Payment method on file */}
        <span
          aria-hidden
          className={`${KEY}-chip ${KEY}-chip-l absolute left-1/2 top-1/2 z-0 size-9`}
        >
          <span className="fill-action stroke-lit grid size-full place-items-center rounded-full">
            <CreditCardIcon className="size-4 text-fg-secondary" />
          </span>
        </span>

        {/* Item count */}
        <span
          aria-hidden
          className={`${KEY}-chip ${KEY}-chip-r absolute left-1/2 top-1/2 z-0 size-9`}
        >
          <span className="grid size-full place-items-center rounded-full border border-accent-violet/30 bg-accent-violet/20 text-[13px] font-semibold tabular-nums text-accent-violet">
            3
          </span>
        </span>

        {/* The sphere that becomes the pill. Overflow keeps the label out of
            frame until the body is wide enough to hold it. */}
        <span
          aria-hidden
          className={`${KEY}-pill absolute left-1/2 top-1/2 z-10 flex items-center overflow-hidden rounded-pill bg-gradient-to-r from-accent-peach via-fg to-accent-blue shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)] group-hover:brightness-105`}
        >
          <ShoppingCartIcon className="size-4 shrink-0 text-black" weight="bold"/>
          <span
            className={`${KEY}-label ml-2 shrink-0 whitespace-nowrap text-sm font-semibold tracking-[-0.01em] text-black`}
          >
            View cart
          </span>
        </span>
      </button>
    </div>
  );
}
