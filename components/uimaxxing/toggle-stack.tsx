"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Class and keyframe names are prefixed with the file slug so the rules below
// stay scoped to this component and never collide with the shared sheet.
const KEY = "toggle-stack";

const MOUNT_MS = 420;
const MOUNT_STAGGER = 120;
const FLIP_STAGGER = 180;
// The scripted flip waits for the last track to finish landing (240ms of
// stagger + a 420ms pop) plus a beat, so the two sequences never overlap.
const FLIP_START = MOUNT_STAGGER * 2 + MOUNT_MS + 60;

// Track 46×28 (~1.65:1), knob 21 (0.75 of the height) seated 3.5px in — so the
// knob clears the track by exactly its own inset on the far side.
const TRAVEL = 18;

type Row = {
  label: string;
  /** The row's tint. It lives on the knob — the track never takes a fill. */
  tint: string;
  /** Blurred bloom behind the track, lit only while on. */
  glow: string;
};

const ROWS: Row[] = [
  { label: "Live prices", tint: "bg-accent-indigo", glow: "bg-accent-indigo/40" },
  { label: "Fill alerts", tint: "bg-positive", glow: "bg-positive/40" },
  { label: "Testnet mode", tint: "bg-fg", glow: "bg-fg/20" },
];

/** Off drains the knob's tint instead of swapping it for another colour, so
 *  the two states are one object at two saturations. Brightness carries the
 *  neutral row, where there is no saturation to drain. */
const KNOB_OFF = "saturate(0.06) brightness(0.68)";
const KNOB_ON = "saturate(1) brightness(1)";

type State = { on: boolean; flips: number };

/**
 * Three pill switches that introduce themselves. Each track pops in from 0.72
 * with a 120ms stagger down the stack, overshooting a touch before it settles;
 * once the last one lands they flip on in the same order, 180ms apart, the knob
 * crossing the track on ease-snap while its own tint comes back up to full
 * saturation — the track itself never lights, so the colour is carried by the
 * part that moves rather than the groove it moves in. The knob
 * stretches 1.1× along its travel and rounds back out as it arrives, so the
 * throw reads as weight rather than a slide. Every row is a real switch — the
 * first press cancels whatever is left of the scripted sequence, and the stack
 * then holds exactly what it is left in.
 */
export function ToggleStack() {
  const [rows, setRows] = useState<State[]>(() =>
    ROWS.map(() => ({ on: false, flips: 0 })),
  );
  // The scripted flips are fire-and-forget timers; a press has to be able to
  // reach back and kill the ones that have not run yet, or a click landing
  // mid-sequence would be silently overwritten a moment later.
  const timers = useRef<number[]>([]);

  useEffect(() => {
    timers.current = ROWS.map((_, i) =>
      window.setTimeout(
        () => flip(i, true),
        FLIP_START + i * FLIP_STAGGER,
      ),
    );
    const pending = timers.current;
    return () => pending.forEach(window.clearTimeout);
  }, []);

  // `flips` only ever counts up: it keys the knob, so every transition remounts
  // it and replays the squash from the top even on a fast double-press.
  function flip(index: number, next?: boolean) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index
          ? { on: next ?? !row.on, flips: row.flips + 1 }
          : row,
      ),
    );
  }

  function press(index: number) {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    flip(index);
  }

  return (
    <div className="w-full max-w-[300px] rounded-card stroke-lit fill-panel p-2">
      <style>{`
        @keyframes ${KEY}-mount {
          0%   { opacity: 0; transform: scale(0.72); }
          64%  { opacity: 1; transform: scale(1.045); animation-timing-function: ease-in-out; }
          100% { opacity: 1; transform: scale(1); }
        }

        @keyframes ${KEY}-label {
          from { opacity: 0; transform: translate3d(-4px, 0, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        /* Mid-travel the knob stretches along its direction of motion and
           thins vertically; the short counter-squash past centre is what makes
           it read as landing rather than stopping. */
        @keyframes ${KEY}-squash {
          0%   { transform: scale(1, 1); }
          44%  { transform: scale(1.1, 0.9); animation-timing-function: ease-in-out; }
          74%  { transform: scale(0.97, 1.035); animation-timing-function: ease-out; }
          100% { transform: scale(1, 1); }
        }

        .${KEY}-mount { animation: ${KEY}-mount ${MOUNT_MS}ms var(--ease-glide) both; }
        .${KEY}-label { animation: ${KEY}-label ${MOUNT_MS}ms var(--ease-glide) both; }
        .${KEY}-squash { animation: ${KEY}-squash 380ms var(--ease-snap) 1; }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-mount,
          .${KEY}-label,
          .${KEY}-squash { animation: none; }
          .${KEY}-travel,
          .${KEY}-glow,
          .${KEY}-knob { transition: none; }
        }
      `}</style>

      {rows.map((row, i) => {
        const tint = ROWS[i] ?? { label: "", glow: "", tint: "" };
        const delay = `${i * MOUNT_STAGGER}ms`;

        return (
          <button
            key={tint.label}
            type="button"
            role="switch"
            aria-checked={row.on}
            onClick={() => press(i)}
            className="interactive row-hover flex h-12 w-full items-center justify-between gap-4 rounded-control px-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo"
          >
            <span
              className={cn(
                `${KEY}-label text-[13px] leading-none transition-colors duration-200 ease-snap`,
                row.on ? "text-fg" : "text-fg-secondary",
              )}
              style={{ animationDelay: delay }}
            >
              {tint.label}
            </span>

            <span
              className={`${KEY}-mount relative block shrink-0`}
              style={{ animationDelay: delay }}
            >
              {/* Bloom sits behind the track, never on it. */}
              <span
                aria-hidden
                className={cn(
                  `${KEY}-glow absolute -inset-1 rounded-pill blur-md transition-opacity duration-300 ease-snap`,
                  tint.glow,
                  row.on ? "opacity-50" : "opacity-0",
                )}
              />

              <span className="relative block h-7 w-[46px] rounded-pill bg-white/[0.07]">
                <span
                  aria-hidden
                  className={`${KEY}-travel absolute left-[3.5px] top-[3.5px] size-[21px] transition-transform duration-[380ms] ease-snap`}
                  style={{
                    transform: row.on
                      ? `translate3d(${TRAVEL}px, 0, 0)`
                      : "translate3d(0, 0, 0)",
                  }}
                >
                  {/* Travel and squash live on separate elements: one transform
                      per element, so the transition and the animation cannot
                      overwrite each other. The keyed span carries nothing but
                      the squash — remounting the painted knob instead would
                      restart its colour, and the inverted row would jump dark
                      before the track had finished lighting up under it. */}
                  <span
                    key={row.flips}
                    className={cn(
                      "block size-full",
                      row.flips > 0 && `${KEY}-squash`,
                    )}
                  >
                    <span
                      className={cn(
                        `${KEY}-knob block size-full rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.55)] transition-[filter] duration-200 ease-snap`,
                        tint.tint,
                      )}
                      style={{ filter: row.on ? KNOB_ON : KNOB_OFF }}
                    />
                  </span>
                </span>

                {/* Hairline last so it rides over the knob. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-pill ring-1 ring-inset ring-white/10"
                />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
