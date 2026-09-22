const KEY = "glass-light-button";

/**
 * Frosted glass pill that lights from within on hover.
 *
 * Four beats, in the order the reference plays them: a specular streak crosses
 * the face over 700ms on `ease-glide`; the glass lifts one step and its inner
 * top highlight tightens; a bloom bleeds 8px past the edge, fading up over
 * 250ms; a press compresses the whole pill to 0.97 and kills the streak, so
 * releasing re-strikes it from the left edge.
 *
 * The sweep is a one-shot bound to `:hover` rather than a loop — `:active`
 * drops the animation entirely, which is what makes the reset on press free.
 * No JavaScript: hover and active carry the whole sequence.
 */
export function GlassLightButton() {
  return (
    <div className="flex w-full items-center justify-center px-4 py-8">
      <style>{`
        /* The pill carries its own hover/press transition instead of
           .interactive: the reference plays a 1.02 lift against a 0.97 press,
           and .interactive's fixed 0.975 would fight both ends of it. */
        .${KEY}-btn {
          transition: transform 220ms var(--ease-snap);
        }
        .${KEY}-btn:hover,
        .${KEY}-btn:focus-visible { transform: scale(1.02); }
        .${KEY}-btn:active {
          transform: scale(0.97);
          transition-duration: 110ms;
        }

        /* Bloom: violet pooling low, where the reference is hottest, over a
           wider indigo wash that wraps the rest of the edge. It sits behind
           the glass, so the backdrop blur is what carries it onto the face —
           the surface is lit through, not painted. */
        .${KEY}-bloom {
          background:
            radial-gradient(
              58% 118% at 50% 68%,
              color-mix(in oklab, var(--color-accent-violet) 62%, transparent),
              transparent 72%
            ),
            radial-gradient(
              124% 148% at 50% 52%,
              color-mix(in oklab, var(--color-accent-indigo) 30%, transparent),
              transparent 78%
            );
          opacity: 0;
          transform: scale(0.93);
          transition:
            opacity 250ms var(--ease-snap),
            transform 250ms var(--ease-snap);
        }
        .${KEY}-btn:hover .${KEY}-bloom,
        .${KEY}-btn:focus-visible .${KEY}-bloom {
          opacity: 1;
          transform: scale(1);
        }

        /* Glass body. The dark base is deliberately near-opaque — the bloom
           behind it would otherwise flood the face and the pill would stop
           reading as a surface; roughly a quarter of the light comes through. */
        .${KEY}-face {
          background-color: color-mix(in oklab, var(--color-bg) 76%, transparent);
          -webkit-backdrop-filter: blur(10px) saturate(1.15);
          backdrop-filter: blur(10px) saturate(1.15);
          box-shadow: 0 12px 28px -14px rgba(0, 0, 0, 0.9);
          transition: box-shadow 250ms var(--ease-snap);
        }
        .${KEY}-btn:hover .${KEY}-face,
        .${KEY}-btn:focus-visible .${KEY}-face {
          box-shadow: 0 16px 34px -12px rgba(0, 0, 0, 0.9);
        }

        /* Resting glass wash, and the brighter one that fades over it — the
           "one step up" is an opacity crossfade because a background-image
           cannot be interpolated. */
        .${KEY}-gloss {
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.09),
            rgba(255, 255, 255, 0.02) 54%,
            rgba(255, 255, 255, 0.05)
          );
        }
        .${KEY}-lift {
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.16),
            rgba(255, 255, 255, 0.05) 54%,
            rgba(255, 255, 255, 0.09)
          );
        }

        /* The light inside the glass, rising off the bottom edge. */
        .${KEY}-inner {
          background: radial-gradient(
            96% 132% at 50% 128%,
            color-mix(in oklab, var(--color-accent-violet) 34%, transparent) 0%,
            color-mix(in oklab, var(--color-accent-indigo) 12%, transparent) 46%,
            transparent 72%
          );
        }

        /* Specular streak, parked off the left edge until a hover runs it. */
        .${KEY}-streak {
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.28) 34%,
            rgba(255, 255, 255, 0.72) 52%,
            transparent
          );
          filter: blur(4px);
          opacity: 0;
          transform: translateX(-150%) skewX(-14deg);
        }
        @keyframes ${KEY}-sweep {
          0%   { opacity: 0; transform: translateX(-150%) skewX(-14deg); }
          12%  { opacity: 1; }
          72%  { opacity: 1; }
          100% { opacity: 0; transform: translateX(420%) skewX(-14deg); }
        }
        .${KEY}-btn:hover .${KEY}-streak,
        .${KEY}-btn:focus-visible .${KEY}-streak {
          animation: ${KEY}-sweep 700ms var(--ease-glide) both;
        }
        /* Press resets the sheen: dropping the animation snaps the streak back
           to its parked transform, and the hover rule re-strikes it on release. */
        .${KEY}-btn:active .${KEY}-streak { animation: none; }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-btn,
          .${KEY}-btn:hover,
          .${KEY}-btn:focus-visible,
          .${KEY}-btn:active { transform: none; }
          .${KEY}-btn:hover .${KEY}-streak,
          .${KEY}-btn:focus-visible .${KEY}-streak { animation: none; }
          .${KEY}-bloom { transition: opacity 250ms var(--ease-snap); transform: none; }
          .${KEY}-btn:hover .${KEY}-bloom,
          .${KEY}-btn:focus-visible .${KEY}-bloom { transform: none; }
        }
      `}</style>

      <button
        type="button"
        aria-label="Light up"
        className={`${KEY}-btn group relative inline-flex rounded-pill focus-visible:outline-2 focus-visible:outline-offset-[6px] focus-visible:outline-accent-indigo`}
      >
        {/* 8px of bleed past the edge, on its own fade so the glow arrives
            under the sweep rather than with it. Painted before the glass, so
            the backdrop filter picks it up. */}
        <span
          aria-hidden
          className={`${KEY}-bloom pointer-events-none absolute -inset-2 rounded-pill blur-[10px]`}
        />

        <span
          className={`${KEY}-face stroke-lit relative flex h-11 items-center overflow-hidden rounded-pill px-7`}
        >
          <span aria-hidden className={`${KEY}-gloss pointer-events-none absolute inset-0`} />
          <span
            aria-hidden
            className={`${KEY}-inner pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[320ms] ease-snap group-hover:opacity-100 group-focus-visible:opacity-100`}
          />
          <span
            aria-hidden
            className={`${KEY}-lift pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[250ms] ease-snap group-hover:opacity-100 group-focus-visible:opacity-100`}
          />

          {/* Inner top highlight in two passes: the soft resting hairline, and
              a tighter, brighter one that fades in — the edge sharpening. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-px h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-4 top-px h-px bg-gradient-to-r from-transparent via-white/65 to-transparent opacity-0 transition-opacity duration-[250ms] ease-snap group-hover:opacity-100 group-focus-visible:opacity-100"
          />

          <span
            aria-hidden
            className={`${KEY}-streak pointer-events-none absolute inset-y-[-40%] left-0 w-1/3`}
          />

          <span className="relative text-[11px] font-semibold uppercase tracking-[0.18em] text-fg">
            Light Up
          </span>
        </span>
      </button>
    </div>
  );
}
