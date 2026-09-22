import { cn } from "@/lib/utils";

export type DotCell = {
  /** Column, 0-indexed from the left. */
  x: number;
  /** Row, 0-indexed from the top. */
  y: number;
  /** Flat index, row-major. */
  i: number;
  /** Signed offset from the centre dot. */
  cx: number;
  cy: number;
};

export type DotMatrixProps = {
  /**
   * `"grid"` is the 5×5 square field. `"triangle"` is the other shape the
   * reference gallery uses: a 4-row pyramid of 1, 2, 3, 4 dots on a triangular
   * lattice, ten dots in all. Only one of its dots — the middle of row 2 — is
   * interior, which is why the shape has patterns a square grid cannot hold.
   */
  layout?: "grid" | "triangle";
  /** Grid is `size` × `size`. Ignored for `triangle`, which is always 4 rows. */
  size?: number;
  /**
   * `"round"` hides the corner dots, leaving a circular field — what the
   * reference uses for anything that rotates, so the sweep does not visibly
   * stall in the corners where the radius is 40% longer.
   */
  shape?: "square" | "round";
  /**
   * Position in a bespoke traversal — a spiral, a serpentine, a ring — exposed
   * to CSS as `--o`. Patterns whose order is not a function of x and y alone
   * would otherwise need a hand-written `nth-child` table.
   */
  order?: (cell: DotCell) => number;
  /** Goes on the grid element — this is where a loader hangs its own class. */
  className?: string;
  /** Goes on every dot, for loaders that want to restyle the whole field. */
  dotClassName?: string;
};

/**
 * The dot field every matrix loader animates.
 *
 * It only lays out and styles the dots; the motion belongs to whoever renders
 * it. Each dot carries its own place in the grid as custom properties, so a
 * loader drives delays off geometry rather than a table of magic numbers:
 *
 *   --x, --y   column and row, 0-indexed from the top-left
 *   --i        flat index, row-major
 *   --cx, --cy signed offset from the centre dot — the frame a ring, sweep or
 *              diagonal is naturally written in
 *   --r        Chebyshev ring index: 0 at the centre, 2 at the edge
 *   --a        angle around the centre, 0–1000 clockwise from 12 o'clock
 *   --p        checkerboard parity, 0 or 1
 *   --o        position in the `order` traversal, if one was given
 *
 * `data-x`, `data-y`, `data-r` and `data-p` mirror the same values as
 * attributes: a per-ring amplitude ramp reads better as three rules than as
 * arithmetic inside a keyframe.
 */
export function DotMatrix({
  layout = "grid",
  size = 5,
  shape = "square",
  order,
  className,
  dotClassName,
}: DotMatrixProps) {
  if (layout === "triangle") {
    return (
      <TriangleField
        order={order}
        className={className}
        dotClassName={dotClassName}
      />
    );
  }

  const mid = (size - 1) / 2;
  // Corners of a 5×5 sit at 2.83 from the centre against 2.0 for the edge
  // midpoints, so this cuts exactly the four that break a circle.
  const limit = mid + 0.5;

  const cells: DotCell[] = Array.from({ length: size * size }, (_, i) => {
    const x = i % size;
    const y = Math.floor(i / size);
    return { i, x, y, cx: x - mid, cy: y - mid };
  });

  return (
    <div
      aria-hidden
      className={cn("dot-matrix", className)}
      style={
        {
          "--n": size,
          gridTemplateColumns: `repeat(${size}, var(--dot-size))`,
        } as React.CSSProperties
      }
    >
      {cells.map((c) => {
        const ring = Math.max(Math.abs(c.cx), Math.abs(c.cy));
        const dist = Math.hypot(c.cx, c.cy);
        // Clockwise from 12 o'clock. The centre dot has no angle; 0 keeps it
        // in step with the top of the sweep rather than lagging a whole turn.
        const angle =
          dist === 0
            ? 0
            : Math.round(
                (((Math.atan2(c.cx, -c.cy) + Math.PI * 2) % (Math.PI * 2)) /
                  (Math.PI * 2)) *
                  1000,
              );
        const parity = (c.x + c.y) % 2;
        const off = shape === "round" && dist > limit;

        return (
          <span
            key={c.i}
            data-x={c.x}
            data-y={c.y}
            data-r={ring}
            data-p={parity}
            data-off={off || undefined}
            className={cn("dot-matrix-dot", dotClassName)}
            style={
              {
                "--x": c.x,
                "--y": c.y,
                "--i": c.i,
                "--cx": c.cx,
                "--cy": c.cy,
                "--r": ring,
                "--a": angle,
                "--p": parity,
                ...(order ? { "--o": order(c) } : null),
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

/** Rows in the pyramid. Four is what the reference uses throughout. */
const TRI_ROWS = 4;

/**
 * The triangular field. Rows are staggered half a pitch, so a dot's horizontal
 * place is `x - y/2` — a half-integer — and that, not `x`, is what a column
 * sweep has to key off: the reference's "column" is a vertical line of the
 * lattice, which picks up one dot from some rows and none from others.
 *
 * Laid out absolutely rather than on a grid, because a staggered row cannot be
 * expressed as grid tracks without inventing half-width columns.
 */
function TriangleField({
  order,
  className,
  dotClassName,
}: Pick<DotMatrixProps, "order" | "className" | "dotClassName">) {
  const cells: DotCell[] = [];
  for (let y = 0; y < TRI_ROWS; y++) {
    for (let x = 0; x <= y; x++) {
      cells.push({
        i: cells.length,
        x,
        y,
        cx: x - y / 2,
        cy: y - (TRI_ROWS - 1) / 2,
      });
    }
  }

  const half = (TRI_ROWS - 1) / 2;

  return (
    <div aria-hidden className={cn("dot-matrix dot-matrix--tri", className)}>
      {cells.map((c) => {
        // The single interior dot; everything else is on the outline.
        const edge = c.y === 0 || c.y === TRI_ROWS - 1 || c.x === 0 || c.x === c.y;
        // Nearest vertex: 0 apex, 1 bottom-left, 2 bottom-right.
        const corner =
          c.y <= 1 ? 0 : c.x <= (c.y - 1) / 2 ? 1 : 2;

        return (
          <span
            key={c.i}
            data-x={c.x}
            data-y={c.y}
            data-edge={edge ? "" : undefined}
            data-corner={corner}
            className={cn("dot-matrix-dot", dotClassName)}
            style={
              {
                "--x": c.x,
                "--y": c.y,
                "--i": c.i,
                "--cx": c.cx,
                "--cy": c.cy,
                "--corner": corner,
                left: `calc((var(--cx) + ${half}) * var(--dot-pitch))`,
                top: `calc(var(--y) * var(--dot-pitch) * 0.866)`,
                ...(order ? { "--o": order(c) } : null),
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
