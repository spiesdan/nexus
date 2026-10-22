type Harmonic = {
  /** Whole number of cycles across the window. Fractional values break the loop. */
  cycles: number;
  amp: number;
  phase?: number;
};

/**
 * Sum of harmonics sampled `n + 1` times across one period, normalised to
 * 0..1 where 0 is the bottom of the plot.
 */
export function periodicSeries({
  n,
  harmonics,
  base = 0.5,
}: {
  n: number;
  harmonics: Harmonic[];
  base?: number;
}): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let v = base;
    for (const h of harmonics) {
      v += h.amp * Math.sin(2 * Math.PI * h.cycles * t + (h.phase ?? 0));
    }
    out.push(Math.min(1, Math.max(0, v)));
  }
  return out;
}

/**
 * Maps a 0..1 series onto an SVG points string. `x0` shifts the whole run,
 * which is how the second (tiled) copy is placed exactly one width along.
 */
export function toPoints(
  values: number[],
  {
    width,
    height,
    x0 = 0,
    pad = 0,
    stepped = false,
  }: {
    width: number;
    height: number;
    x0?: number;
    pad?: number;
    /** Emit orthogonal steps (hold, then jump) instead of straight segments. */
    stepped?: boolean;
  },
): string {
  const step = width / (values.length - 1);
  const usable = height - pad * 2;
  const x = (i: number) => (x0 + i * step).toFixed(1);
  const y = (v: number) => (pad + usable * (1 - v)).toFixed(1);

  if (!stepped) return values.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  // Hold each value to the next sample's x, then jump. The run still ends at
  // (x0 + width, last), so a periodic series tiles seamlessly either way.
  const pts: string[] = [];
  values.forEach((v, i) => {
    pts.push(`${x(i)},${y(v)}`);
    if (i < values.length - 1) pts.push(`${x(i + 1)},${y(v)}`);
  });
  return pts.join(" ");
}

/**
 * Same series as a closed area, dropped to the baseline at both ends.
 *
 * `lastX` fecha a área no último dado em vez da borda direita do gráfico.
 * É o que impede uma série truncada (a realizada para em HOJE) de parecer
 * que continua até o fim do mês: sem ele, o polígono ganha um trecho reto
 * e sombreado depois do último ponto.
 */
export function toArea(
  values: number[],
  opts: { width: number; height: number; x0?: number; pad?: number; lastX?: number },
): string {
  const line = toPoints(values, opts);
  const x0 = opts.x0 ?? 0;
  const lastX = opts.lastX ?? x0 + opts.width;
  return `${x0},${opts.height} ${line} ${lastX},${opts.height}`;
}
