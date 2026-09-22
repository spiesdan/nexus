import { ArrowRightIcon } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

/**
 * A sector, and the instruments inside it. Weight is market size — it sets the
 * area of the tile; change is the day's move — it sets the colour. Both are
 * hardcoded, because a heatmap generated from random numbers redraws itself on
 * every hydration and every one of those is a mismatch.
 */
type Leaf = { symbol: string; weight: number; change: number };
type Sector = { name: string; items: Leaf[] };

/* Tuples rather than objects: sixty-odd instruments written as records is four
   hundred lines of punctuation, and the shape is obvious from the type above. */
const SECTORS: Sector[] = (
  [
    [
      "Semiconductors",
      [
        ["HLX", 2180, 0.7],
        ["NRW", 1240, -1.8],
        ["ORB", 640, -0.04],
        ["VLD", 590, 3.8],
        ["AXM", 410, 2.6],
        ["KRN", 380, 1.9],
        ["ZEV", 270, -0.6],
        ["QDR", 240, 2.2],
        ["LMB", 190, -2.4],
      ],
    ],
    [
      "Software",
      [
        ["SFT", 2460, -3.2],
        ["NVA", 720, -1.1],
        ["OMN", 610, -0.9],
        ["CSR", 430, 1.4],
        ["DRA", 360, 2.8],
        ["TGM", 300, -2.1],
        ["RHO", 250, -1.6],
      ],
    ],
    [
      "Platforms",
      [
        ["ALD", 2310, -2.0],
        ["BSK", 1180, 1.7],
        ["MTQ", 520, -3.6],
        ["XEN", 380, -1.2],
        ["CRV", 300, -2.7],
        ["PFN", 240, -0.8],
      ],
    ],
    [
      "Financials",
      [
        ["HDR", 980, -1.4],
        ["VEO", 540, -2.9],
        ["LNZ", 480, 1.1],
        ["GRA", 420, -0.7],
        ["OPX", 360, 2.4],
        ["TVR", 310, -1.9],
        ["SLN", 280, -0.5],
        ["KOV", 240, 1.6],
        ["ARC", 210, -3.1],
        ["JTX", 180, 0.9],
        ["NBL", 160, -1.3],
        ["FLC", 140, 4.2],
      ],
    ],
    [
      "Retail & Staples",
      [
        ["QNT", 1720, -3.2],
        ["DVX", 760, -0.6],
        ["WSP", 520, 1.8],
        ["TRN", 460, -1.5],
        ["EGL", 380, 0.4],
        ["MRD", 320, -2.2],
        ["PVT", 260, 1.2],
      ],
    ],
    [
      "Energy",
      [
        ["CLM", 880, -3.8],
        ["BRX", 520, -2.6],
        ["STG", 410, -1.1],
        ["NDR", 340, -4.6],
        ["VRN", 280, 0.6],
        ["HWK", 220, -2.0],
      ],
    ],
    [
      "Health",
      [
        ["LYR", 1140, -0.2],
        ["JNV", 690, 0.1],
        ["ABV", 560, -1.7],
        ["CDX", 420, 2.9],
        ["TMB", 350, -0.9],
        ["RGN", 290, 5.4],
        ["OSP", 230, -2.3],
      ],
    ],
    [
      "Industrials",
      [
        ["FRG", 640, 1.3],
        ["AXL", 480, -1.8],
        ["MDC", 390, 0.8],
        ["KLP", 320, -2.5],
        ["SVR", 270, 3.1],
        ["TDN", 220, -0.3],
      ],
    ],
    [
      "Utilities",
      [
        ["WTR", 520, 0.5],
        ["GRD", 380, -0.4],
        ["ELM", 300, 1.0],
        ["PYR", 240, -1.2],
      ],
    ],
  ] as const
).map(([name, items]) => ({
  name,
  items: items.map(([symbol, weight, change]) => ({ symbol, weight, change })),
}));

type Box = { x: number; y: number; w: number; h: number };
type Tile = Leaf & Box;

/**
 * The aspect ratio the worst tile in a row would have, given the length of the
 * side the row runs along. The squarified algorithm is entirely this number:
 * keep adding to the row while it improves, stop the moment it gets worse.
 */
function worst(areas: number[], side: number): number {
  const sum = areas.reduce((total, area) => total + area, 0);
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  const s2 = side * side;
  const sum2 = sum * sum;
  return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
}

/**
 * Squarified treemap (Bruls, Huizing, van Wijk).
 *
 * Plain slice-and-dice is two lines shorter and produces slivers — tiles a
 * hundred times longer than they are tall, which cannot hold a label and read
 * as a rendering fault rather than a small holding. This lays each row along
 * whichever side is currently shorter, which keeps tiles near square.
 *
 * Runs once, at module scope, on the server: the layout is a property of the
 * data, and the data does not change.
 */
function squarify(items: Leaf[], box: Box): Tile[] {
  const out: Tile[] = [];
  let rest = [...items].sort((a, b) => b.weight - a.weight);
  let free = { ...box };
  let remaining = rest.reduce((total, item) => total + item.weight, 0);

  while (rest.length && remaining > 0) {
    const side = Math.min(free.w, free.h);
    const scale = (free.w * free.h) / remaining;

    /* Grow the row while the worst aspect ratio in it keeps improving. */
    const row: Leaf[] = [];
    let best = Infinity;
    while (rest.length) {
      const head = rest[0];
      if (!head) break;
      const trial = [...row, head].map((item) => item.weight * scale);
      const ratio = worst(trial, side);
      if (row.length && ratio > best) break;
      best = ratio;
      row.push(head);
      rest = rest.slice(1);
    }

    const rowWeight = row.reduce((total, item) => total + item.weight, 0);
    const depth = (rowWeight * scale) / side;
    /* The row runs along the shorter side, so it is a column when the free box
       is wider than it is tall, and a band across the top when it is taller. */
    const vertical = free.h <= free.w;
    let offset = 0;

    for (const item of row) {
      const length = (item.weight / rowWeight) * side;
      out.push(
        vertical
          ? { ...item, x: free.x, y: free.y + offset, w: depth, h: length }
          : { ...item, x: free.x + offset, y: free.y, w: length, h: depth },
      );
      offset += length;
    }

    free = vertical
      ? { x: free.x + depth, y: free.y, w: free.w - depth, h: free.h }
      : { x: free.x, y: free.y + depth, w: free.w, h: free.h - depth };
    remaining -= rowWeight;
  }

  return out;
}

/**
 * The colour scale. Seven steps, because a continuous ramp needs a colour
 * function and the palette here is a closed set — these are the two semantic
 * hues at three strengths each, plus the neutral well for a flat tape. Every
 * one of them mirrors into the light theme on its own, which a literal hex
 * would not.
 *
 * The two outer steps carry `text-bg`: at full strength the tile is the
 * brightest thing on the card and the label has to invert to stay readable.
 */
const STEPS: { limit: number; className: string }[] = [
  { limit: -4, className: "bg-negative/70 text-bg" },
  { limit: -2, className: "bg-negative/40 text-fg" },
  { limit: -0.5, className: "bg-negative-bg-strong text-fg-secondary" },
  { limit: 0.5, className: "bg-well text-fg-secondary" },
  { limit: 2, className: "bg-positive-bg-strong text-fg-secondary" },
  { limit: 4, className: "bg-positive/40 text-fg" },
  { limit: Infinity, className: "bg-positive/70 text-bg" },
];

function step(change: number): string {
  return (
    STEPS.find((entry) => change < entry.limit)?.className ??
    STEPS[STEPS.length - 1]?.className ??
    ""
  );
}

/** Signed to two places, always with its sign — a bare "0.0%" reads as missing. */
function signed(change: number): string {
  return `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change).toFixed(1)}%`;
}

/* The sector blocks, then the instruments inside each one. Two passes rather
   than one flat map: a flat treemap of sixty instruments interleaves sectors
   wherever the areas happen to fall, and the point of a heatmap is that you can
   see a whole sector go red at once. */
const BLOCKS = squarify(
  SECTORS.map((sector) => ({
    symbol: sector.name,
    change: 0,
    weight: sector.items.reduce((total, item) => total + item.weight, 0),
  })),
  { x: 0, y: 0, w: 100, h: 100 },
).map((block) => {
  const sector = SECTORS.find((entry) => entry.name === block.symbol)!;
  return {
    name: sector.name,
    box: block,
    /* Laid out in the block's own coordinates, then read back as percentages
       of it — so the tiles inside a sector position against the sector, and the
       whole map stays resolution-independent.

       `span` is the same tile measured against the whole map, and it is what
       decides whether a label fits. Measuring against the sector was wrong in
       the way that only shows up once: a tile filling a third of a small sector
       is a third of very little, and it claimed a label it had no room for. */
    tiles: squarify(sector.items, { x: 0, y: 0, w: 100, h: 100 }).map(
      (tile) => ({
        ...tile,
        span: {
          w: (tile.w * block.w) / 100,
          h: (tile.h * block.h) / 100,
        },
      }),
    ),
  };
});

/** Percent box to inline position. The only inline style here: it is data. */
function place(box: Box): React.CSSProperties {
  return {
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.w}%`,
    height: `${box.h}%`,
  };
}

/**
 * A market heatmap: every instrument sized by weight, coloured by its move.
 *
 * The whole thing is one server component with no state — the layout is solved
 * at module scope and the tiles are absolutely positioned in percentages, so a
 * card at 240px and a card at 1200px run the same arithmetic and neither ships
 * a byte of JavaScript to do it.
 *
 * Labels appear by tier rather than by measuring: a tile that is a fifth of the
 * map can hold a symbol and a number, one that is a twentieth can hold neither,
 * and the container queries drop each tier as the card gets small instead of
 * letting type shrink until it is texture.
 */
export function MarketHeatmap() {
  return (
    <div className="stroke-lit fill-panel @container w-full overflow-hidden rounded-card p-3 @md:p-4">
      <header className="flex items-center justify-between gap-3 px-1 pb-3">
        <h3 className="text-[11px] uppercase tracking-[0.16em] text-fg-muted @md:text-xs">
          Market heatmap
        </h3>
        <span className="interactive hidden items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg @sm:inline-flex">
          Full map
          <ArrowRightIcon className="size-3" weight="bold" />
        </span>
      </header>

      {/* The map keeps its own ratio rather than filling whatever height the
          card has: a treemap stretched to a letterbox turns every tile into a
          sliver, which is the exact failure the squarified layout exists to
          avoid. */}
      <div className="relative aspect-[5/2] w-full">
        {BLOCKS.map((block) => (
          <div key={block.name} className="absolute" style={place(block.box)}>
            {/* The sector gutter, wider than the gap between tiles inside it.
                That difference is the only thing separating one sector from the
                next — without it sixty tiles read as one field and the map
                stops being about sectors. Insetting here rather than in the
                maths keeps the arithmetic in one place. */}
            <div className="absolute inset-[2px]">
              {block.tiles.map((tile) => {
                /* Thresholds are percentages of the whole map, so they mean the
                   same thing in every sector: about 56px and 31px on a card at
                   full width, which is what a symbol over a number needs. */
                const label = tile.span.w >= 6.5 && tile.span.h >= 9;
                const symbolOnly = tile.span.w >= 4 && tile.span.h >= 5.5;
                return (
                  <div
                    key={tile.symbol}
                    className="absolute"
                    style={place(tile)}
                  >
                    <div
                      className={cn(
                        "absolute inset-[0.75px] flex flex-col items-center justify-center overflow-hidden rounded-[3px] px-1 text-center leading-none",
                        step(tile.change),
                      )}
                    >
                      {label || symbolOnly ? (
                        <span
                          className={cn(
                            "hidden truncate text-[clamp(0.5rem,1.15cqw,0.8125rem)] font-medium tracking-tight",
                            label ? "@sm:block" : "@xl:block",
                          )}
                        >
                          {tile.symbol}
                        </span>
                      ) : null}
                      {label ? (
                        <span className="mt-1 hidden text-[clamp(0.45rem,0.95cqw,0.6875rem)] tabular-nums opacity-80 @md:block">
                          {signed(tile.change)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <footer className="mt-3 flex items-center justify-between gap-2 px-1">
        {[
          { key: "down-8", swatch: "bg-negative/70", label: "−8%" },
          { key: "down-4", swatch: "bg-negative/40", label: "−4%" },
          { key: "flat", swatch: "bg-well", label: "0%" },
          { key: "up-4", swatch: "bg-positive/40", label: "+4%" },
          { key: "up-8", swatch: "bg-positive/70", label: "+8%" },
        ].map((entry) => (
          <span
            key={entry.key}
            className="flex items-center gap-1.5 text-[11px] tabular-nums text-fg-muted"
          >
            <span className={cn("size-2 shrink-0 rounded-full", entry.swatch)} />
            {entry.label}
          </span>
        ))}
      </footer>
    </div>
  );
}
