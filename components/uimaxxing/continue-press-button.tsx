"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Class and keyframe names are prefixed with the file slug so the rules below
// stay scoped to this component and never collide with the shared sheet.
const KEY = "continue-press";

// Where the dip bottoms out — and where the label hands over. The outgoing
// word is already gone by then, so the two copies never sit at half opacity
// together mid-swap.
const DIP_MS = 140;

// How long the confirmation has to stay on screen before the button is allowed
// to offer itself again.
const DWELL_MS = 1000;

type Phase = "idle" | "dip" | "confirm";

/**
 * A wide primary CTA that answers a press. Pointer-down compresses the pill to
 * 0.92 about its centre while the bright gradient drains to a muted tone
 * (130ms ease-snap); at the bottom of that dip the label swaps for a shorter
 * confirmation, which fades up from 20% over 250ms while the pill springs back
 * 0.92 → 0.98 → 1. Releasing brings back the original label and the full
 * brightness — but never before the confirmation has been readable, so a fast
 * click still plays the whole sequence.
 */
export function ContinuePressButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  // The press, the dwell timer and the release all have to agree before the
  // confirmation lets go, and two of the three arrive outside React's render
  // pass — so the machine reads from refs and only the rendered phase is state.
  const phaseRef = useRef<Phase>("idle");
  const heldRef = useRef(false);
  const dwelledRef = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout);
    },
    [],
  );

  function go(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  // The release is what restores the original label, but the dwell gates it:
  // whichever of the two lands last is the one that ends the confirmation.
  function settle() {
    if (phaseRef.current !== "confirm") return;
    if (!dwelledRef.current || heldRef.current) return;
    dwelledRef.current = false;
    go("idle");
  }

  function press() {
    heldRef.current = true;
    if (phaseRef.current !== "idle") return;
    timers.current.forEach(window.clearTimeout);
    dwelledRef.current = false;
    timers.current = [
      window.setTimeout(() => go("confirm"), DIP_MS),
      window.setTimeout(() => {
        dwelledRef.current = true;
        settle();
      }, DIP_MS + DWELL_MS),
    ];
    go("dip");
  }

  function release() {
    heldRef.current = false;
    settle();
  }

  const muted = phase !== "idle";

  return (
    <div className="relative isolate flex w-full max-w-[360px] flex-col items-center gap-4">
      <style>{`
        /* Two-stage settle, not a single ease back: the pill clears most of
           the compression fast, then creeps the last percent home with a
           whisper of overshoot so it reads as sprung rather than driven. */
        @keyframes ${KEY}-spring {
          0%   { transform: scale(0.92); }
          46%  { transform: scale(0.98); animation-timing-function: ease-out; }
          76%  { transform: scale(1.008); animation-timing-function: ease-in-out; }
          100% { transform: scale(1); }
        }

        /* The incoming label starts visible-but-faint, matching the reference:
           it is already there at the bottom of the dip, it just has to arrive. */
        @keyframes ${KEY}-label-in {
          from { opacity: 0.2; }
          to   { opacity: 1; }
        }

        .${KEY}-btn {
          transition-property: transform;
          transition-duration: 260ms;
          transition-timing-function: var(--ease-glide);
        }
        /* .stroke-sheen draws its hairline as a ::before, which the fill layer
           would otherwise paint straight over — lift the ring above it. */
        .${KEY}-btn::before { z-index: 1; }
        /* Outweighs .interactive:active so the press owns the whole dip — the
           two scales must never compound. */
        button.${KEY}-btn.is-dip,
        button.${KEY}-btn.is-dip:active {
          transform: scale(0.92);
          transition-duration: 130ms;
          transition-timing-function: var(--ease-snap);
        }
        .${KEY}-btn.is-spring {
          animation: ${KEY}-spring 380ms var(--ease-snap) both;
        }

        /* One fill, drained — not a second colour swapped in. Dropping
           saturation and brightness together keeps the muted tone reading as
           the same surface with the light taken out of it. */
        .${KEY}-fill {
          transition: filter 220ms var(--ease-glide);
        }
        .${KEY}-btn:hover .${KEY}-fill { filter: brightness(1.05); }
        .${KEY}-fill.is-muted,
        .${KEY}-btn:hover .${KEY}-fill.is-muted {
          filter: saturate(0.18) brightness(0.45);
          transition-duration: 130ms;
          transition-timing-function: var(--ease-snap);
        }

        .${KEY}-label { transition: opacity 200ms var(--ease-glide); }
        .${KEY}-label.is-out {
          opacity: 0;
          transition-duration: 100ms;
          transition-timing-function: var(--ease-snap);
        }
        .${KEY}-label-alt {
          opacity: 0;
          transition: opacity 160ms var(--ease-snap);
        }
        .${KEY}-label-alt.is-in {
          opacity: 1;
          animation: ${KEY}-label-in 250ms var(--ease-glide) forwards;
        }

        .${KEY}-glow { transition: opacity 220ms var(--ease-glide); }
        .${KEY}-glow.is-muted { opacity: 0.14; }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-btn,
          button.${KEY}-btn.is-dip,
          button.${KEY}-btn.is-dip:active { transform: none; transition: none; }
          .${KEY}-btn.is-spring { animation: none; }
          .${KEY}-label,
          .${KEY}-label-alt { transition: none; }
          .${KEY}-label-alt.is-in { animation: none; }
          .${KEY}-fill,
          .${KEY}-glow { transition: none; }
        }
      `}</style>

      {/* The CTA's own light. It dims with the fill so the pill loses
          brightness as one object rather than a lit surface on a dead glow. */}
      <span
        aria-hidden
        className={cn(
          `${KEY}-glow absolute inset-x-7 top-3 -z-10 h-9 rounded-full bg-gradient-to-r from-accent-peach/50 via-fg/35 to-accent-blue/50 opacity-[0.45] blur-2xl`,
          muted && "is-muted",
        )}
      />

      <button
        type="button"
        aria-label="Continue"
        onPointerDown={press}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onKeyDown={(event) => {
          if (event.repeat) return;
          if (event.key === " " || event.key === "Enter") press();
        }}
        onKeyUp={release}
        className={cn(
          `${KEY}-btn stroke-sheen interactive relative flex h-14 w-full select-none items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-indigo`,
          phase === "dip" && "is-dip",
          phase === "confirm" && "is-spring",
        )}
      >
        <span
          aria-hidden
          className={cn(
            `${KEY}-fill absolute inset-0 rounded-control bg-gradient-to-r from-accent-peach via-fg to-accent-blue`,
            muted && "is-muted",
          )}
        />

        {/* Both labels hold the full width, so neither swap nudges the other
            and the pill's centre stays fixed through the compression. */}
        <span
          aria-hidden
          className={cn(
            `${KEY}-label absolute inset-0 flex items-center justify-center text-[17px] font-semibold leading-none text-on-brand`,
            muted && "is-out",
          )}
        >
          Continue
        </span>
        <span
          aria-hidden
          className={cn(
            `${KEY}-label-alt absolute inset-0 flex items-center justify-center text-[17px] font-semibold leading-none text-fg`,
            phase === "confirm" && "is-in",
          )}
        >
          Done
        </span>
      </button>

      <p
        className={cn(
          "text-[11px] leading-none text-fg-muted transition-opacity duration-200 ease-snap",
          muted && "opacity-40",
        )}
      >
        Press to confirm
      </p>

      <span role="status" aria-live="polite" className="sr-only">
        {phase === "confirm" ? "Done" : ""}
      </span>
    </div>
  );
}
