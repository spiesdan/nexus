const KEY = "linear-progress";

// The track is a fixed 244px so the fill's gradient can be pinned to that same
// length below. Declaring it once keeps the two from drifting apart.
const TRACK = 244;

/**
 * Linear Progress Bar — a 244x8 pill whose fill sweeps left cap to right cap
 * at a flat rate, holds at full for a beat, then hard-cuts back to empty.
 *
 * The travel is deliberately `linear`, not `ease-glide`. Frame-by-frame the
 * reference advances the leading edge by the same ~9% of the track every
 * sampled frame from start to finish — there is no ease-in at the left cap and
 * no settle at the right. That flat rate is what makes it read as elapsed work
 * rather than a UI element sliding into place, so the house travel curve would
 * actively misreport what the bar means. The two fades are the only things
 * that are not measuring anything, so those keep `ease-glide`.
 *
 * `sweep` and `lead` are the same curve written twice — 0 to 100 over the first
 * 77% of the loop, parked for the remaining 23%. They have to be separate
 * because one drives the fill's width and the other drives the bloom's `left`,
 * but they must stay locked frame for frame or the glow detaches from the edge
 * it is supposed to belong to. Any change to one is a change to both.
 *
 * There is no rewind: at the end of the loop the fill snaps to zero in a single
 * frame, exactly as the reference does. The `settle` fade is what makes that
 * survivable — the leading highlight and its bloom retire during the hold, so
 * by the instant of the cut the bar is a flat, finished stripe and the only
 * thing that disappears is the stripe itself.
 */
export function LinearProgress() {
  return (
    <div className="flex w-full items-center justify-center py-4">
      <style>{`
        @keyframes ${KEY}-sweep {
          0%   { width: 0%; }
          77%  { width: 100%; }
          100% { width: 100%; }
        }

        /* Locked to ${KEY}-sweep: same stops, same hold. */
        @keyframes ${KEY}-lead {
          0%   { left: 0%; }
          77%  { left: 100%; }
          100% { left: 100%; }
        }

        /* Shared by the leading sheen and its bloom so they arrive and leave as
           one piece of light. 12% is where the fill first gets wider than the
           40px sheen — reaching full brightness any earlier just paints the
           whole stub white and loses the indigo left cap. Out by 100% means the
           hard reset has nothing left to strand at the right cap. */
        @keyframes ${KEY}-settle {
          0%   { opacity: 0; }
          12%  { opacity: 1; }
          77%  { opacity: 1; }
          100% { opacity: 0; }
        }

        /* The width animation relaunches layout every frame; containment stops
           that work at the track instead of letting it walk up the page. */
        .${KEY}-track { contain: layout paint; }

        .${KEY}-fill {
          width: 0%;
          /* Sized to the track, not to itself, and pinned left — so the ramp
             belongs to the bar and the fill uncovers it, rather than a short
             gradient being stretched wider on every frame. The tip therefore
             warms from indigo to peach as it travels, which is the fill
             arriving somewhere rather than a colour cycling in place. */
          background-image: linear-gradient(
            90deg,
            var(--color-accent-indigo),
            var(--color-accent-violet) 58%,
            var(--color-accent-peach)
          );
          background-size: ${TRACK}px 100%;
          background-position: left center;
          background-repeat: no-repeat;
          animation: ${KEY}-sweep 2600ms linear infinite;
        }

        .${KEY}-tip { animation: ${KEY}-settle 2600ms var(--ease-glide) infinite; }

        .${KEY}-bloom {
          left: 0%;
          animation:
            ${KEY}-lead 2600ms linear infinite,
            ${KEY}-settle 2600ms var(--ease-glide) infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-fill,
          .${KEY}-tip,
          .${KEY}-bloom { animation: none; }
          /* Parked mid-sweep rather than at 0 or 100, so a still frame still
             reads as a progress bar and not as a bare track or a solid pill. */
          .${KEY}-fill { width: 62%; }
          .${KEY}-bloom { left: 62%; }
        }
      `}</style>

      {/* Inline width, not an arbitrary-value class: Tailwind scans source text,
          so a class built from TRACK at runtime would never be generated. This
          keeps the one constant driving both the box and the gradient. */}
      <div className="relative max-w-full" style={{ width: TRACK }}>
        <div
          role="progressbar"
          aria-label="Loading"
          aria-valuemin={0}
          aria-valuemax={100}
          className={`${KEY}-track relative h-2 w-full overflow-hidden rounded-pill bg-white/[0.06]`}
        >
          {/* rounded-pill + overflow-hidden on the fill itself is what keeps the
              leading edge capped at r=4 the whole way across, and it is also
              what crops the sheen to that cap. */}
          <div
            aria-hidden
            className={`${KEY}-fill absolute inset-y-0 left-0 overflow-hidden rounded-pill`}
          >
            <span
              className={`${KEY}-tip absolute inset-y-0 right-0 w-10 bg-gradient-to-r from-transparent via-white/10 to-white/45`}
            />
          </div>
        </div>

        {/* Outside the track's clip on purpose — the bloom is the part of the
            highlight allowed to spill past the pill, which is what sells it as
            light rather than a second painted shape. */}
        <span
          aria-hidden
          className={`${KEY}-bloom pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-violet/25 blur-[6px]`}
        />
      </div>
    </div>
  );
}
