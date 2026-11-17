// Period insights (Analytics: tap a card). What a period looked like for one sensor, beyond the
// line chart: how much of the time it was in each status, the extremes and when, the longest
// spell outside normal, and how much data there is. Judged with the station's limits as they are
// now - the same as the chart's colours - and the gas sensor's warm-up readings after a power-on
// are left out, as everywhere else (domain/warmup.ts). Pure: tested in period.test.ts.
import { classify, METRIC_INFO, type Metric, type Range } from './thresholds.ts';
import { warmingUp, type WarmupReading } from './warmup.ts';

export type StatusKey = 'lowCritical' | 'lowWarning' | 'normal' | 'highWarning' | 'highCritical';
type Severity = 'normal' | 'warning' | 'critical';

export interface StatusShare {
  key: StatusKey;
  level: Severity;
  /** the status word, e.g. "Too hot" */
  label: string;
  count: number;
  /** share of the judged readings, 0-100; the shares add up to 100 */
  pct: number;
}

export interface PeriodInsight {
  /** readings judged: with a value, and not from the gas sensor's warm-up */
  count: number;
  avg: number | null;
  min: { t: number; v: number } | null;
  max: { t: number; v: number } | null;
  /** last judged value minus the first */
  change: number | null;
  /** statuses that occurred, from too low to too high */
  shares: StatusShare[];
  /** the most severe status reached (its most frequent word); null without readings */
  worst: { level: Severity; label: string; high: boolean } | null;
  /** longest run of readings outside normal; a gap in the data ends a run */
  longestOut: { startMs: number; endMs: number; minutes: number; label: string } | null;
  /** gas readings left out as warm-up after a power-on */
  warmupSkipped: number;
  /** pH readings from an uncalibrated probe (judged, but flagged) */
  uncalibrated: number;
  /** hours of the period (up to now) with at least one reading, and all its hours */
  hoursWithData: number;
  hoursTotal: number;
}

/** What periodInsight needs from a reading (the app's Reading has all of it). */
export type PeriodReading = WarmupReading & {
  serverTimeMs: number;
  phCalibrated: boolean;
  ph: number | null;
  temperatureC: number | null;
  nh3GasMv: number | null;
};

const ORDER: StatusKey[] = ['lowCritical', 'lowWarning', 'normal', 'highWarning', 'highCritical'];
const RANK: Record<Severity, number> = { normal: 0, warning: 1, critical: 2 };

/** Rounds shares so they add up to exactly 100 (largest remainder). */
export function percentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return counts.map(() => 0);
  const raw = counts.map((c) => (c * 100) / total);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const byRemainder = raw.map((r, i) => ({ i, r: r - Math.floor(r) })).sort((a, b) => b.r - a.r);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    if (counts[i] > 0) {
      out[i]++;
      left--;
    }
  }
  return out;
}

/** `readings` oldest first; `range` the station's limits for this sensor (limits.ts). */
export function periodInsight(
  metric: Metric,
  readings: PeriodReading[],
  range: Range,
  opts: { intervalSec: number; startMs: number; endMs: number; nowMs: number },
): PeriodInsight {
  const gapMs = 3 * opts.intervalSec * 1000; // the stale rule: 3 missed readings = a gap
  const counts: Record<StatusKey, number> = { lowCritical: 0, lowWarning: 0, normal: 0, highWarning: 0, highCritical: 0 };
  const labels: Partial<Record<StatusKey, string>> = {};
  const hours = new Set<number>();
  let count = 0;
  let sum = 0;
  let min: PeriodInsight['min'] = null;
  let max: PeriodInsight['max'] = null;
  let first: number | null = null;
  let last: number | null = null;
  let warmupSkipped = 0;
  let uncalibrated = 0;
  let run: { startMs: number; endMs: number; label: string; rank: number } | null = null;
  let longest: PeriodInsight['longestOut'] = null;
  const intervalMin = Math.max(1, Math.round(opts.intervalSec / 60));
  const closeRun = () => {
    if (!run) return;
    // A run of n readings a minute apart covers about n minutes.
    const minutes = Math.round((run.endMs - run.startMs) / 60_000) + intervalMin;
    if (!longest || minutes > longest.minutes) longest = { startMs: run.startMs, endMs: run.endMs, minutes, label: run.label };
    run = null;
  };

  for (const r of readings) {
    hours.add(Math.floor(r.serverTimeMs / 3_600_000));
    const raw = r[metric];
    const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    if (v === null) continue;
    if (warmingUp(metric, r, opts.intervalSec)) {
      warmupSkipped++;
      continue;
    }
    if (metric === 'ph' && !r.phCalibrated) uncalibrated++;
    count++;
    sum += v;
    if (!min || v < min.v) min = { t: r.serverTimeMs, v };
    if (!max || v > max.v) max = { t: r.serverTimeMs, v };
    if (first === null) first = v;
    last = v;
    const s = classify(metric, v, range);
    const level: Severity = s.level === 'warning' || s.level === 'critical' ? s.level : 'normal';
    const low = v < range.normal[0];
    const key: StatusKey = level === 'normal' ? 'normal'
      : low ? (level === 'critical' ? 'lowCritical' : 'lowWarning')
        : (level === 'critical' ? 'highCritical' : 'highWarning');
    counts[key]++;
    labels[key] = s.label;
    // A normal reading, or a gap in the data, ends a run outside normal.
    if (run && (level === 'normal' || r.serverTimeMs - run.endMs > gapMs)) closeRun();
    if (level !== 'normal') {
      if (!run) run = { startMs: r.serverTimeMs, endMs: r.serverTimeMs, label: s.label, rank: RANK[level] };
      run.endMs = r.serverTimeMs;
      if (RANK[level] > run.rank) {
        run.rank = RANK[level];
        run.label = s.label;
      }
    }
  }
  closeRun();

  const pcts = percentages(ORDER.map((k) => counts[k]));
  const shares: StatusShare[] = ORDER.map((key, i): StatusShare => ({
    key,
    level: key === 'normal' ? 'normal' : key.endsWith('Critical') ? 'critical' : 'warning',
    label: key === 'normal' ? 'Normal' : labels[key] ?? '',
    count: counts[key],
    pct: pcts[i],
  })).filter((s) => s.count > 0);

  // The most severe status; between two of the same severity (too hot and too cold), the more frequent.
  let worstShare: StatusShare | null = null;
  for (const s of shares) {
    if (!worstShare || RANK[s.level] > RANK[worstShare.level] || (RANK[s.level] === RANK[worstShare.level] && s.count > worstShare.count)) worstShare = s;
  }

  const end = Math.min(opts.endMs, opts.nowMs);
  return {
    count,
    avg: count ? sum / count : null,
    min,
    max,
    change: count > 1 && first !== null && last !== null ? last - first : null,
    shares,
    worst: worstShare && { level: worstShare.level, label: worstShare.label, high: worstShare.key.startsWith('high') },
    longestOut: longest,
    warmupSkipped,
    uncalibrated,
    hoursWithData: hours.size,
    hoursTotal: Math.max(1, Math.ceil((end - opts.startMs) / 3_600_000)),
  };
}

/** "Too hot at times" / "Normal throughout": the period at a glance (a chip on the card). */
export function periodBadge(p: PeriodInsight): { level: Severity | 'unknown'; label: string } {
  if (!p.count || !p.worst) return { level: 'unknown', label: 'No readings' };
  if (p.worst.level === 'normal') return { level: 'normal', label: 'Normal throughout' };
  return { level: p.worst.level, label: `${p.worst.label} at times` };
}

/**
 * The period in one or two plain sentences, e.g. "Normal 79% of the time. Too hot at times: up to
 * 57.8 °C (Nov 16, 3:33 PM)." `when` formats a time for this period (a clock, or a date and time).
 */
export function periodSummary(metric: Metric, p: PeriodInsight, when: (t: number) => string): string {
  if (!p.count || p.avg === null) return 'No readings in this period.';
  const { unit, decimals } = METRIC_INFO[metric];
  const fmt = (v: number) => `${v.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
  if (!p.worst || p.worst.level === 'normal') return `Normal the whole time, averaging ${fmt(p.avg)}.`;
  const normal = p.shares.find((s) => s.key === 'normal')?.pct ?? 0;
  const extreme = p.worst.high ? p.max : p.min;
  const peak = extreme ? `: ${p.worst.high ? 'up to' : 'down to'} ${fmt(extreme.v)} (${when(extreme.t)})` : '';
  return `Normal ${normal}% of the time. ${p.worst.label} at times${peak}.`;
}

/** "45 min" / "3 h 20 min" / "2 d 4 h" */
export function durationText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return minutes % 60 ? `${h} h ${minutes % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}
