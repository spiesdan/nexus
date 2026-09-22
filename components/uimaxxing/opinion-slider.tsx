"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Keyframes and custom properties are prefixed with the file slug so nothing
// here can collide with the shared sheet or with a parallel component.
const KEY = "opinion-slider";

// The SVG is drawn 1:1 with its wrapper, so a client coordinate minus the
// wrapper origin lands directly in this space — no viewBox scaling math.
const W = 280;
const H = 44;
const CY = 22; // rope centre line at rest
const X0 = 16; // knob centre at 0
const X1 = 264; // knob centre at 100
const SPAN = X1 - X0;

const ZONES = [
  "Strongly disagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly agree",
] as const;

const MARKS = [
  { at: 0, label: "Disagree" },
  { at: 50, label: "Neutral" },
  { at: 100, label: "Agree" },
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n * 100) / 100;

// Quadratic Bézier on one axis — used to seat the scale marks on the rope
// wherever it happens to be bent.
const bez = (a: number, b: number, c: number, t: number) =>
  (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

type Flight = { id: number; peak: number; ms: number };

type Physics = {
  x: number;
  y: number;
  downX: number;
  lastX: number;
  lastT: number;
  vel: number;
  bow: number;
  bowV: number;
  dragging: boolean;
};

/**
 * An opinion slider strung like elastic. The track is a rope pinned at both
 * ends and pulled at the knob: drag sideways and the speed sags it, drag up or
 * down and it bows toward the pointer, and letting go springs it back through
 * zero rather than easing to it. The knob swells to 1.2 under the finger and
 * stretches with velocity — tail lagging, head reaching — then squashes ~10%
 * narrow on arrival before settling. The lit portion left of the knob gains
 * brightness and saturation as the value climbs, and the readout rides above
 * the knob counting with it.
 *
 * Bow and stretch are integrated in one rAF loop against pointer refs, so a
 * drag renders once per frame no matter how many pointer events arrive.
 */
export function OpinionSlider() {
  const [value, setValue] = useState(62);
  const [bow, setBow] = useState(0);
  const [stretch, setStretch] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [settle, setSettle] = useState(0);

  const trackRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const flightId = useRef(0);
  const reduced = useRef(false);
  const phys = useRef<Physics>({
    x: 0,
    y: 0,
    downX: 0,
    lastX: 0,
    lastT: 0,
    vel: 0,
    bow: 0,
    bowV: 0,
    dragging: false,
  });

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  function run() {
    if (rafRef.current !== null) return;
    const step = () => {
      const s = phys.current;
      const rect = rectRef.current;

      if (s.dragging) {
        if (rect) {
          setValue(Math.round(clamp((s.x - rect.left - X0) / SPAN, 0, 1) * 100));
        }
        if (reduced.current) {
          s.bow = 0;
          setBow(0);
          setStretch(1);
        } else {
          // Sideways speed sags the rope; vertical pointer offset bows it
          // toward the finger. The lerp is what keeps the two from snapping.
          s.vel *= 0.84;
          const pull = rect ? clamp(s.y - rect.top - CY, -24, 24) : 0;
          const target = pull * 0.8 + clamp(Math.abs(s.vel) * 5.5, 0, 11);
          s.bow += (target - s.bow) * 0.3;
          setBow(round(s.bow));
          setStretch(round(clamp(1 + Math.abs(s.vel) * 0.5, 1, 2)));
        }
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      // Released: a spring, not an ease — the rope has to cross zero and come
      // back before it dies, or it reads as rubber rather than elastic.
      if (reduced.current || (Math.abs(s.bow) < 0.08 && Math.abs(s.bowV) < 0.08)) {
        s.bow = 0;
        s.bowV = 0;
        setBow(0);
        rafRef.current = null;
        return;
      }
      s.bowV = (s.bowV - s.bow * 0.26) * 0.76;
      s.bow += s.bowV;
      setBow(round(s.bow));
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }

  // A jump the knob has to travel: it stretches on the way, whips the rope as
  // it leaves, and lands short before settling. Scaled by distance so a 4-point
  // arrow key gets a nudge and a full-width click gets the whole liquid throw.
  function launch(distance: number) {
    if (reduced.current) return;
    const k = Math.min(1, distance * 1.8);
    flightId.current += 1;
    setFlight({
      id: flightId.current,
      peak: round(1 + k * 1.15),
      ms: Math.round(190 + k * 280),
    });
    phys.current.bow += k * 12;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => setFlight(null),
      Math.round(190 + k * 280),
    );
  }

  function cancelFlight() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setFlight(null);
  }

  function commit(clientX: number) {
    const rect = rectRef.current;
    if (!rect) return value;
    // rect is the live, possibly scaled box; dividing by the factor puts the
    // pointer back into the 280-unit space the constants are written in.
    const k = rect.width / W;
    const next = Math.round(
      clamp(((clientX - rect.left) / k - X0) / SPAN, 0, 1) * 100,
    );
    setValue(next);
    return next;
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const el = trackRef.current;
    if (!el) return;
    el.setPointerCapture(event.pointerId);
    rectRef.current = el.getBoundingClientRect();

    const s = phys.current;
    s.x = event.clientX;
    s.y = event.clientY;
    s.downX = event.clientX;
    s.lastX = event.clientX;
    s.lastT = event.timeStamp;
    s.vel = 0;
    s.bowV = 0;
    s.dragging = true;
    setDragging(true);

    const next = commit(event.clientX);
    if (Math.abs(next - value) > 1) launch(Math.abs(next - value) / 100);
    run();
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const s = phys.current;
    if (!s.dragging) return;
    // The first real movement hands the knob over to the finger — the travel
    // transition has to be gone by then or it would drag a frame behind.
    if (flight && Math.abs(event.clientX - s.downX) > 2) cancelFlight();
    const dt = Math.max(event.timeStamp - s.lastT, 8);
    s.vel = (event.clientX - s.lastX) / dt;
    s.lastX = event.clientX;
    s.lastT = event.timeStamp;
    s.x = event.clientX;
    s.y = event.clientY;
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const s = phys.current;
    if (!s.dragging) return;
    s.dragging = false;
    s.vel = 0;
    s.bowV = 0;
    setDragging(false);
    setStretch(1);
    // A click that is still in flight already ends on its own squash; adding
    // the release spring on top would double the overshoot.
    if (!flight) setSettle((n) => n + 1);
    if (trackRef.current?.hasPointerCapture(event.pointerId)) {
      trackRef.current.releasePointerCapture(event.pointerId);
    }
    run();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const by = event.shiftKey ? 10 : 4;
    let next = value;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = clamp(value + by, 0, 100);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = clamp(value - by, 0, 100);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 100;
    else return;
    event.preventDefault();
    if (next === value) return;
    setValue(next);
    launch(Math.abs(next - value) / 100);
    run();
  }

  const kx = round(X0 + (SPAN * value) / 100);
  const ky = round(CY + bow);
  const cy = round(CY + bow * 0.72);
  // Control points sit at each segment's horizontal midpoint, which makes x
  // linear in t — so a mark's t is just its share of the segment.
  const fillD = `M${X0} ${CY}Q${round((X0 + kx) / 2)} ${cy} ${kx} ${ky}`;
  const restD = `M${kx} ${ky}Q${round((kx + X1) / 2)} ${cy} ${X1} ${CY}`;

  function ropeY(x: number) {
    if (x <= kx) return bez(CY, cy, ky, kx <= X0 ? 1 : (x - X0) / (kx - X0));
    return bez(ky, cy, CY, kx >= X1 ? 0 : (x - kx) / (X1 - kx));
  }

  const lift = value / 100;
  const zone = ZONES[Math.min(ZONES.length - 1, Math.floor(value / 20))];
  const travel = flight ? `transform ${flight.ms}ms var(--ease-glide)` : "none";

  return (
    /* The rope's geometry is 1:1 with the DOM, so it cannot reflow. Below
       360px the stage is narrower than 280px, and scaling the whole thing
       keeps every part in register — `commit` divides the factor back out. */
    <div className="w-[280px] max-w-full origin-left select-none max-[359px]:scale-[0.85]">
      <style>{`
        /* The lit half gains light as the value climbs — one filter on the
           stroke, so the gradient keeps its own colours throughout. */
        .${KEY}-fill,
        .${KEY}-glow {
          transition:
            opacity 260ms var(--ease-glide),
            filter 260ms var(--ease-glide);
        }

        /* In-flight liquid stretch: the pill reaches ahead, then lands ~12%
           narrow for a beat before finding its width again. */
        @keyframes ${KEY}-fly {
          0%   { transform: scaleX(1); }
          30%  { transform: scaleX(var(--${KEY}-peak)); animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
          68%  { transform: scaleX(0.88); animation-timing-function: ease-in-out; }
          100% { transform: scaleX(1); }
        }
        .${KEY}-fly { animation: ${KEY}-fly var(--${KEY}-ms) var(--ease-glide) both; }

        /* Release: 1.2 down through a squash and one overshoot, rather than a
           straight ease back to rest. */
        @keyframes ${KEY}-settle {
          0%   { transform: scale(1.2); }
          34%  { transform: scale(0.9, 1.08); animation-timing-function: ease-out; }
          66%  { transform: scale(1.07, 0.97); animation-timing-function: ease-in-out; }
          100% { transform: scale(1); }
        }
        .${KEY}-settle { animation: ${KEY}-settle 440ms var(--ease-snap) both; }

        .${KEY}-press { transition: transform 200ms var(--ease-snap); }
        .${KEY}-stretch { transition: transform 120ms var(--ease-snap); }

        @media (prefers-reduced-motion: reduce) {
          .${KEY}-fly,
          .${KEY}-settle { animation: none; }
          .${KEY}-press,
          .${KEY}-stretch,
          .${KEY}-fill,
          .${KEY}-glow { transition: none; }
        }
      `}</style>

      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-muted">
          Conviction
        </span>
        <span key={zone} className="roll-in text-[13px] text-fg">
          {zone}
        </span>
      </div>

      {/* Readout lane — the bubble rides the knob and takes a share of the bow
          so it hangs off the rope rather than floating free of it. */}
      <div className="relative mt-3 h-7">
        <span
          className="absolute left-0 top-0 block"
          style={{ transform: `translateX(${kx}px)`, transition: travel }}
        >
          <span
            className={cn(
              "absolute left-0 top-0 flex h-6 items-center rounded-pill border px-2 text-[12px] font-semibold leading-none tabular-nums transition-[color,background-color,border-color] duration-200 ease-snap",
              dragging
                ? "border-white/15 bg-white/[0.09] text-fg"
                : "border-white/10 bg-white/[0.05] text-fg-secondary",
            )}
            style={{ transform: `translate(-50%, ${round(bow * 0.28)}px)` }}
          >
            {value}
          </span>
        </span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="How strongly do you agree?"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value} of 100, ${zone}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        /* Owns its cursor: the rope is a drag surface, not a click target. */
        data-cursor-own
        // No .interactive here on purpose: its 0.975 active scale would shrink
        // the whole rope under the finger and fight the knob's own press.
        className={cn(
          "relative mt-1 h-11 w-[280px] touch-none rounded-pill focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-indigo",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          aria-hidden
          className="absolute left-0 top-0 overflow-visible"
        >
          <defs>
            <linearGradient
              id={`${KEY}-ramp`}
              gradientUnits="userSpaceOnUse"
              x1={X0}
              y1="0"
              x2={X1}
              y2="0"
            >
              <stop offset="0" stopColor="var(--color-accent-blue)" />
              <stop offset="0.42" stopColor="var(--color-accent-indigo)" />
              <stop offset="0.74" stopColor="var(--color-accent-violet)" />
              <stop offset="1" stopColor="var(--color-accent-peach)" />
            </linearGradient>
            {/* userSpaceOnUse: the rope's bounding box is a few pixels tall,
                so a percentage filter region would crop the bloom away. */}
            <filter
              id={`${KEY}-bloom`}
              filterUnits="userSpaceOnUse"
              x="-20"
              y="-40"
              width={W + 40}
              height={H + 80}
            >
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          {/* The lit half's own light, sitting under the rope. */}
          <path
            className={`${KEY}-glow`}
            d={fillD}
            fill="none"
            stroke={`url(#${KEY}-ramp)`}
            strokeWidth="8"
            strokeLinecap="round"
            filter={`url(#${KEY}-bloom)`}
            style={{ opacity: round(0.12 + lift * 0.38) }}
          />

          <path
            d={restD}
            fill="none"
            className="stroke-white/10"
            strokeWidth="8"
            strokeLinecap="round"
          />

          <path
            className={`${KEY}-fill`}
            d={fillD}
            fill="none"
            stroke={`url(#${KEY}-ramp)`}
            strokeWidth="8"
            strokeLinecap="round"
            style={{
              opacity: round(0.55 + lift * 0.45),
              filter: `brightness(${round(0.8 + lift * 0.5)}) saturate(${round(0.75 + lift * 0.45)})`,
            }}
          />

          {/* Scale marks ride the rope wherever it is bent — they read as
              printed on the track, not floating over it. */}
          {MARKS.map((mark) => {
            const x = X0 + (SPAN * mark.at) / 100;
            const under = x <= kx + 0.5;
            return (
              <circle
                key={mark.at}
                cx={x}
                cy={round(ropeY(x))}
                r="1.6"
                fill={under ? "var(--color-bg)" : "var(--color-fg)"}
                opacity={under ? 0.5 : 0.3}
              />
            );
          })}
        </svg>

        {/* Knob transforms are split one concern per layer — travel, bow,
            press and stretch each own a node, so a spring on one never has to
            be folded into the matrix of another. */}
        <span
          className="pointer-events-none absolute left-0 top-0 block"
          style={{ transform: `translateX(${kx}px)`, transition: travel }}
        >
          <span
            className="absolute left-0 top-0 block"
            style={{ transform: `translateY(${ky}px)` }}
          >
            <span
              key={`f${flight?.id ?? 0}`}
              className={cn(`${KEY}-stretch absolute left-0 top-0 block`, flight && `${KEY}-fly`)}
              style={
                {
                  transform: `scaleX(${dragging && !flight ? stretch : 1})`,
                  [`--${KEY}-peak`]: `${flight?.peak ?? 1}`,
                  [`--${KEY}-ms`]: `${flight?.ms ?? 0}ms`,
                } as React.CSSProperties
              }
            >
              <span
                key={`p${settle}`}
                className={cn(
                  `${KEY}-press absolute left-0 top-0 block`,
                  !dragging && settle > 0 && `${KEY}-settle`,
                )}
                style={{ transform: `scale(${dragging ? 1.2 : 1})` }}
              >
                <span className="absolute -left-[11px] -top-1.5 block h-3 w-[22px] rounded-pill bg-gradient-to-b from-white to-fg shadow-[0_6px_14px_-3px_rgba(0,0,0,0.95)]" />
              </span>
            </span>
          </span>
        </span>
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        {MARKS.map((mark) => (
          <span
            key={mark.label}
            className={cn(
              "text-[10px] uppercase tracking-[0.12em] transition-colors duration-200 ease-snap",
              Math.abs(value - mark.at) <= 25 ? "text-fg-secondary" : "text-fg-muted",
            )}
          >
            {mark.label}
          </span>
        ))}
      </div>
    </div>
  );
}
