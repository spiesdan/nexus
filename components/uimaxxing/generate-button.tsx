"use client";

import { useState } from "react";
import { PaperclipIcon, PlusIcon } from "@phosphor-icons/react/ssr";

import { TypingField } from "@/components/ui/typing-field";
import { cn } from "@/lib/utils";

/** Animation-name prefix — keeps these keyframes from colliding with any other file. */
const KEY = "genbtn";

/** One four-point star, centred on its own origin so a scale reads as a twinkle. */
const STAR =
  "M 0 -10 C 0.9 -3.6 3.6 -0.9 10 0 C 3.6 0.9 0.9 3.6 0 10 C -0.9 3.6 -3.6 0.9 -10 0 C -3.6 -0.9 -0.9 -3.6 0 -10 Z";

/**
 * The Generate pill at the right end of a floating prompt bar.
 *
 * Hover lifts the pill (1.035 + a deeper shadow); pressing snaps it back to
 * 1.0 while the sparkle collapses to half size and its satellites dim, then
 * the glyph springs back through an overshoot. The satellites keep twinkling
 * on their own periods so the glyph never reads as static.
 */
export function GenerateButton() {
  // Bumped on every click; also keys the glyph so the burst restarts cleanly.
  const [fires, setFires] = useState(0);

  return (
    <div className="relative w-full max-w-[440px]">
      <style>{`
        .${KEY}-pill {
          transition:
            transform 170ms var(--ease-snap),
            box-shadow 170ms var(--ease-snap),
            filter 170ms var(--ease-snap);
        }
        .${KEY}-pill:hover {
          transform: scale(1.035);
          filter: brightness(1.07);
          box-shadow:
            0 18px 34px -8px rgba(0, 0, 0, 0.78),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
        }
        /* Press lands after hover in source order, so it wins while both match. */
        .${KEY}-pill:active {
          transform: scale(1);
          transition-duration: 90ms;
          box-shadow:
            0 6px 14px -4px rgba(0, 0, 0, 0.6),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .${KEY}-pill:focus-visible {
          outline: 2px solid var(--color-accent-indigo);
          outline-offset: 3px;
        }

        .${KEY}-star,
        .${KEY}-dot {
          transform-box: fill-box;
          transform-origin: center;
        }
        .${KEY}-star {
          transition: transform 90ms var(--ease-snap);
        }
        .${KEY}-dots {
          transition: opacity 90ms var(--ease-snap);
        }
        .${KEY}-pill:active .${KEY}-star { transform: scale(0.5); }
        .${KEY}-pill:active .${KEY}-dots { opacity: 0.16; }

        /* Satellites twinkle on unrelated periods — never in step with each other. */
        .${KEY}-dot-a { animation: ${KEY}-tw-a 2.6s var(--ease-glide) infinite; }
        .${KEY}-dot-b { animation: ${KEY}-tw-b 3.7s var(--ease-glide) 0.5s infinite; }

        /* No fill mode on either: a forwards fill would outrank the :active
           rules above and the second press would land dead. The satellites'
           lag behind the star is baked into the keyframes instead of a delay. */
        .${KEY}-fire .${KEY}-star { animation: ${KEY}-star-back 210ms var(--ease-snap); }
        .${KEY}-fire .${KEY}-dots { animation: ${KEY}-dots-back 320ms var(--ease-snap); }

        @keyframes ${KEY}-star-back {
          0%   { transform: scale(0.5); }
          55%  { transform: scale(1.16); }
          78%  { transform: scale(0.97); }
          100% { transform: scale(1); }
        }
        @keyframes ${KEY}-dots-back {
          0%, 14% { opacity: 0.16; }
          78%     { opacity: 1; }
          100%    { opacity: 1; }
        }
        @keyframes ${KEY}-tw-a {
          0%, 58%, 100% { opacity: 1; transform: scale(1); }
          72%           { opacity: 0.28; transform: scale(0.66); }
        }
        @keyframes ${KEY}-tw-b {
          0%, 34%, 100% { opacity: 0.85; transform: scale(0.9); }
          46%           { opacity: 1; transform: scale(1.2); }
        }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-dot-a,
          .${KEY}-dot-b,
          .${KEY}-fire .${KEY}-star,
          .${KEY}-fire .${KEY}-dots { animation: none; }
        }
      `}</style>

      {/* Floating halo — the bar reads as lifted off the stage, not seated on it. */}
      <div aria-hidden className="animate-drift pointer-events-none absolute inset-0">
        <div className="absolute -bottom-2 left-[8%] h-8 w-[56%] rounded-full bg-accent-indigo/25 blur-xl" />
        <div className="absolute -bottom-1 right-[6%] h-7 w-[36%] rounded-full bg-accent-violet/20 blur-lg" />
      </div>

      <div className="stroke-lit relative flex h-14 items-center gap-0.5 rounded-pill bg-surface/80 px-2 shadow-[0_22px_48px_-18px_rgba(0,0,0,0.95)] backdrop-blur-xl">
        {/* Frosted sheen across the top-right of the bar */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-pill bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.05]"
        />

        <button
          type="button"
          aria-label="Add context"
          className="hover-spin interactive relative flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-white/[0.06] hover:text-fg"
        >
          <PlusIcon className="size-[18px]" />
        </button>

        <button
          type="button"
          aria-label="Attach a file"
          className="hover-tilt interactive relative flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-white/[0.06] hover:text-fg"
        >
          <PaperclipIcon className="size-4" />
        </button>

        <TypingField
          placeholder="Describe a scene…"
          aria-label="Prompt"
          className="ml-2 min-w-0 flex-1 text-[13px] text-fg"
        />

        <button
          type="button"
          aria-label="Generate prompt"
          onClick={() => setFires((n) => n + 1)}
          className={`${KEY}-pill fill-action stroke-lit relative ml-1 flex h-9 shrink-0 items-center gap-1.5 rounded-pill pl-2.5 pr-3.5 text-[13px] font-semibold text-fg`}
        >
          <svg
            key={fires}
            aria-hidden
            viewBox="0 0 24 24"
            fill="currentColor"
            className={cn("size-[15px] shrink-0 overflow-visible", fires > 0 && `${KEY}-fire`)}
          >
            <g transform="translate(14.4 13.6) scale(0.78)">
              <path className={`${KEY}-star`} d={STAR} />
            </g>
            <g className={`${KEY}-dots`}>
              <g transform="translate(7.6 6.5) scale(0.28)">
                <path className={`${KEY}-dot ${KEY}-dot-a`} d={STAR} />
              </g>
              <g transform="translate(6.8 17.2) scale(0.18)">
                <path className={`${KEY}-dot ${KEY}-dot-b`} d={STAR} opacity={0.85} />
              </g>
            </g>
          </svg>
          Generate
        </button>
      </div>
    </div>
  );
}
