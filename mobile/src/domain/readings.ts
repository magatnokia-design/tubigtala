// Interpretation of reading values for display. Chemistry only: nothing here says whether
// water is safe, because the sensors cannot support that claim (CLAUDE.md).

/** pH scale words. 7 is neutral; within 0.5 of it reads "neutral". */
export function phDescriptor(ph: number | null): string {
  if (ph === null) return 'No reading';
  if (Math.abs(ph - 7) <= 0.5) return 'Neutral';
  if (ph < 7) return ph >= 6 ? 'Slightly acidic' : 'Acidic';
  return ph <= 8 ? 'Slightly basic' : 'Basic';
}

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
 * Reduces a series to at most `maxPoints` by averaging equal-size buckets. A bucket whose
 * samples are all missing stays null, so the chart shows a gap instead of a fake value.
 */
export function downsample(points: Point[], maxPoints: number): Point[] {
  if (points.length <= maxPoints) return points;
  const out: Point[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const bucket = points.slice(Math.floor((i * points.length) / maxPoints), Math.floor(((i + 1) * points.length) / maxPoints));
    const s = stats(bucket.map((p) => p.v));
    out.push({ t: bucket[Math.floor(bucket.length / 2)].t, v: s ? s.avg : null });
  }
  return out;
}
