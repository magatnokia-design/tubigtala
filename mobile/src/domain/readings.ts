// Interpretation of reading values for display. Chemistry only: nothing here says whether
// water is safe, because the sensors cannot support that claim (CLAUDE.md).

export interface Stats {
  min: number;
  max: number;
  avg: number;
  /** number of valid (non-null) values */
  count: number;
}

/** Lowest/average/highest of the valid values; null if there are none. Missing values are skipped, never counted as 0. */
export function stats(values: (number | null)[]): Stats | null {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
    sum += v;
    count++;
  }
  return count ? { min, max, avg: sum / count, count } : null;
}

export interface Point {
  t: number;
  v: number | null;
}

/**
 * Prepares a series for a chart: at most `maxPoints`, spaced evenly in TIME (not by count), and
 * with a null wherever the station sent nothing for longer than `gapMs`, so the line breaks
 * there instead of drawing a straight line across hours with no data. A bucket whose readings are
 * all missing also stays null. Points must be in time order.
 *
 * A long series is split into maxPoints / 2 time buckets, and each keeps its LOWEST and HIGHEST
 * reading (in time order) - not their average, which flattened short spikes: half an hour of hot
 * water in a month of readings (app 0.9.7 shows up to 31 days) would otherwise vanish.
 */
export function chartSeries(points: Point[], maxPoints: number, gapMs: number): Point[] {
  if (points.length < 2) return points;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  let series = points;
  let gap = gapMs;
  if (points.length > maxPoints && t1 > t0) {
    const n = Math.max(1, Math.floor(maxPoints / 2));
    const width = (t1 - t0) / n;
    const buckets: Point[][] = Array.from({ length: n }, () => []);
    for (const p of points) buckets[Math.min(n - 1, Math.floor((p.t - t0) / width))].push(p);
    series = [];
    for (const b of buckets) {
      if (!b.length) continue; // an empty bucket becomes a gap below
      const valid = b.filter((p): p is { t: number; v: number } => p.v !== null && Number.isFinite(p.v));
      if (!valid.length) {
        series.push({ t: b[Math.floor(b.length / 2)].t, v: null });
        continue;
      }
      let lo = valid[0];
      let hi = valid[0];
      for (const p of valid) {
        if (p.v < lo.v) lo = p;
        if (p.v > hi.v) hi = p;
      }
      if (lo.t === hi.t) series.push(hi);
      else series.push(...(lo.t < hi.t ? [lo, hi] : [hi, lo]));
    }
    // Neighbouring buckets can be up to two widths apart without any missing time.
    gap = Math.max(gapMs, 2.5 * width);
  }
  const out: Point[] = [];
  for (const p of series) {
    const prev = out[out.length - 1];
    if (prev && p.t - prev.t > gap) out.push({ t: (prev.t + p.t) / 2, v: null });
    out.push(p);
  }
  return out;
}

/** Round axis values ("nice numbers") covering [min, max], about `count` of them. */
export function niceTicks(min: number, max: number, count = 3): number[] {
  const range = max - min || Math.abs(max) || 1;
  const raw = range / Math.max(count, 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw * 0.999) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}
