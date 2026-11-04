// Short, factual sentences about a series of readings for the Analytics cards.
// Missing readings are left out, never counted as zero.
import { classify, METRIC_INFO, type Metric } from './thresholds.ts';

export interface Sample {
  t: number;
  v: number | null;
}

export interface Insight {
  /** percentage of valid readings classified "normal" (0-100), null when no data */
  normalPct: number | null;
  latest: { t: number; v: number } | null;
  min: { t: number; v: number } | null;
  max: { t: number; v: number } | null;
  /** change from the first to the last valid reading */
  change: number | null;
  count: number;
}

export function insight(metric: Metric, samples: Sample[]): Insight {
  const valid = samples.filter((s): s is { t: number; v: number } => s.v !== null && Number.isFinite(s.v));
  if (!valid.length) return { normalPct: null, latest: null, min: null, max: null, change: null, count: 0 };
  let min = valid[0];
  let max = valid[0];
  let normal = 0;
  for (const s of valid) {
    if (s.v < min.v) min = s;
    if (s.v > max.v) max = s;
    if (classify(metric, s.v).level === 'normal') normal++;
  }
  return {
    normalPct: Math.round((normal / valid.length) * 100),
    latest: valid[valid.length - 1],
    min,
    max,
    change: valid.length > 1 ? valid[valid.length - 1].v - valid[0].v : null,
    count: valid.length,
  };
}

/** e.g. "Normal 94% of the time · rose 0.4 °C". */
export function insightSentence(metric: Metric, i: Insight): string {
  if (i.normalPct === null) return 'No readings in this period';
  const { unit, decimals } = METRIC_INFO[metric];
  const parts = [i.normalPct === 100 ? 'Normal the whole time' : `Normal ${i.normalPct}% of the time`];
  if (i.change !== null) {
    const step = 10 ** -decimals;
    if (Math.abs(i.change) < step) parts.push('steady');
    else parts.push(`${i.change > 0 ? 'rose' : 'fell'} ${Math.abs(i.change).toFixed(decimals)}${unit ? ` ${unit}` : ''}`);
  }
  return parts.join(' · ');
}
