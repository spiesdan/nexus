const KEY = "emoji-reaction";

const CHIPS = [
  { glyph: "👍", label: "Nice", name: "React with nice" },
  { glyph: "🙌", label: "Congrats", name: "React with congrats" },
];

/**
 * Reaction pills whose glyph waves on hover: a hard flick out to −14°, then
 * three decaying swings back to rest over 620ms, with an early 1.15 scale
 * punch. Only the glyph moves — the label is a sibling, so it never wobbles
 * with it, and the surface lift is carried by the button itself.
 */
export function EmojiReactionButton() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <style>{`
        /* The bare stops (0%, 92%) fall back to the animation's own ease-snap;
           the extremes carry a pendulum ease so the swings read as momentum
           rather than as seven separate flicks. */
        @keyframes ${KEY}-wave {
          0%   { transform: rotate(0deg) scale(1); }
          12%  { transform: rotate(-14deg) scale(1.15);  animation-timing-function: ease-in-out; }
          26%  { transform: rotate(13deg) scale(1.13);   animation-timing-function: ease-in-out; }
          40%  { transform: rotate(-10deg) scale(1.1);   animation-timing-function: ease-in-out; }
          54%  { transform: rotate(7.5deg) scale(1.07);  animation-timing-function: ease-in-out; }
          68%  { transform: rotate(-5deg) scale(1.05);   animation-timing-function: ease-in-out; }
          82%  { transform: rotate(3deg) scale(1.03);    animation-timing-function: ease-in-out; }
          92%  { transform: rotate(-1.5deg) scale(1.01); }
          100% { transform: rotate(0deg) scale(1); }
        }

        .${KEY}-glyph {
          display: inline-block;
          /* pivot at the wrist, not the centre of the glyph box */
          transform-origin: 58% 82%;
          will-change: transform;
        }

        .${KEY}-btn:hover .${KEY}-glyph,
        .${KEY}-btn:focus-visible .${KEY}-glyph {
          animation: ${KEY}-wave 620ms var(--ease-snap) both;
        }

        /* Beats the .interactive:active scale so the lift and the press can
           share one transform. */
        button.${KEY}-btn:hover { transform: translateY(-2px); }
        button.${KEY}-btn:active {
          transform: translateY(-1px) scale(0.975);
          transition-duration: 90ms;
        }

        .${KEY}-hero:hover {
          box-shadow:
            0 20px 38px -12px rgba(0, 0, 0, 0.85),
            inset 0 1px 0 rgba(245, 245, 245, 0.1);
        }
        .${KEY}-chip:hover { box-shadow: 0 10px 22px -10px rgba(0, 0, 0, 0.7); }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-btn:hover .${KEY}-glyph,
          .${KEY}-btn:focus-visible .${KEY}-glyph { animation: none; }
          button.${KEY}-btn:hover { transform: none; }
        }
      `}</style>

      <button
        type="button"
        aria-label="Wave hello"
        className={`${KEY}-btn ${KEY}-hero group interactive flex h-12 items-center gap-2.5 rounded-pill stroke-lit fill-action pl-4 pr-5`}
      >
        <span className="relative grid place-items-center">
          {/* warm bloom behind the glyph, lit only while it waves */}
          <span
            aria-hidden
            className="absolute size-9 rounded-full bg-accent-peach/25 opacity-0 blur-lg transition-opacity duration-200 ease-snap group-hover:opacity-100"
          />
          <span className={`${KEY}-glyph relative text-[22px] leading-none`}>
            👋
          </span>
        </span>
        <span className="relative text-[15px] font-semibold leading-none text-fg">
          Hey
        </span>
      </button>

      <div className="flex items-center gap-2">
        {CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            aria-label={chip.name}
            className={`${KEY}-btn ${KEY}-chip interactive flex h-9 items-center gap-2 rounded-pill border border-white/[0.07] bg-white/[0.05] pl-3 pr-3.5 text-[13px] font-medium text-fg-secondary hover:bg-white/[0.08] hover:text-fg`}
          >
            <span className={`${KEY}-glyph text-[15px] leading-none`}>
              {chip.glyph}
            </span>
            <span className="leading-none">{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
