// Alert limits a station's owner can set (Settings > Alert limits), stored on the station record
// devices/{id}.limits (docs/data-model.md). The app and the Cloud Functions both read them with
// limitsFromDoc, so a reading is classified against the same numbers everywhere; a sensor whose
// stored limits are missing or invalid uses the defaults (RANGES in thresholds.ts). The same
// checks run in the form (limitFieldError), in firestore.rules (validLimits) and here.
//
// Per sensor, two levels: inside the normal range = normal; between it and the critical limits =
// warning (phone notification); beyond the critical limits = critical (notification, plus SMS
// after SMS_STREAK readings for temperature and calibrated pH). Ammonia gas has a high side only.
// Like thresholds.ts this file is compiled into the Cloud Functions: no app-only imports.
import { METRIC_INFO, RANGES, type Metric, type Range } from './thresholds.ts';

export type Limits = Record<Metric, Range>;

export const LIMIT_METRICS: Metric[] = ['ph', 'temperatureC', 'nh3GasMv'];

/** What a limit can be set to: what each sensor can report (the readings' bounds in firestore.rules). */
export const LIMIT_BOUNDS: Record<Metric, [number, number]> = {
  ph: [0, 14],
  temperatureC: [-10, 125],
  nh3GasMv: [0, 5500],
};

/** Ammonia gas is only checked on the high side: its two low limits stay 0 (nothing below normal). */
export const HIGH_SIDE_ONLY: Record<Metric, boolean> = { ph: false, temperatureC: false, nh3GasMv: true };

/**
 * devices/{id}.limits.{metric} as stored. Normal is inclusive (normalMin..normalMax); a value
 * below criticalBelow or above criticalAbove is critical - the same as Range's `warning` bounds.
 */
export interface StoredRange {
  normalMin: number;
  normalMax: number;
  criticalBelow: number;
  criticalAbove: number;
}

export type LimitField = keyof StoredRange;
export const LIMIT_FIELDS: LimitField[] = ['normalMin', 'normalMax', 'criticalBelow', 'criticalAbove'];

export const toStored = (r: Range): StoredRange =>
  ({ normalMin: r.normal[0], normalMax: r.normal[1], criticalBelow: r.warning[0], criticalAbove: r.warning[1] });
export const fromStored = (s: StoredRange): Range =>
  ({ normal: [s.normalMin, s.normalMax], warning: [s.criticalBelow, s.criticalAbove] });

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Same checks as firestore.rules validLimits: in bounds, ordered, gas low side 0. */
export function validRange(metric: Metric, r: Range): boolean {
  const [lo, hi] = LIMIT_BOUNDS[metric];
  const { normal: [nMin, nMax], warning: [cBelow, cAbove] } = r;
  if (![nMin, nMax, cBelow, cAbove].every((v) => isNum(v) && v >= lo && v <= hi)) return false;
  if (HIGH_SIDE_ONLY[metric] && (nMin !== 0 || cBelow !== 0)) return false;
  return cBelow <= nMin && nMin < nMax && nMax <= cAbove;
}

/** One stored sensor entry, or null when it is missing or invalid (then the defaults apply). */
export function rangeFromStored(metric: Metric, raw: unknown): Range | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!LIMIT_FIELDS.every((f) => isNum(o[f]))) return null;
  const r = fromStored(o as unknown as StoredRange);
  return validRange(metric, r) ? r : null;
}

export const sameRange = (a: Range, b: Range) =>
  a.normal[0] === b.normal[0] && a.normal[1] === b.normal[1] && a.warning[0] === b.warning[0] && a.warning[1] === b.warning[1];

/** True when every sensor uses the default limits. */
export const isDefaultLimits = (l: Limits) => LIMIT_METRICS.every((m) => sameRange(l[m], RANGES[m]));

/**
 * The station's limits from its record (`devices/{id}.limits`, any shape), sensor by sensor:
 * missing or invalid ones are the defaults. `custom` = at least one sensor differs from them.
 */
export function limitsFromDoc(raw: unknown): { limits: Limits; custom: boolean } {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const limits = Object.fromEntries(LIMIT_METRICS.map((m) => [m, rangeFromStored(m, o[m]) ?? RANGES[m]])) as Limits;
  return { limits, custom: !isDefaultLimits(limits) };
}

/** A station's limits; the defaults for no station, or a device cached by an app version before 0.9.4. */
export const limitsOf = (device: { limits?: Limits } | null | undefined): Limits => device?.limits ?? RANGES;

// ---- the form (Settings > Alert limits)

export type LimitTexts = Record<LimitField, string>;

/** The four inputs of one sensor, as text. */
export function limitTexts(metric: Metric, r: Range): LimitTexts {
  const { decimals } = METRIC_INFO[metric];
  const t = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(decimals));
  const s = toStored(r);
  return { normalMin: t(s.normalMin), normalMax: t(s.normalMax), criticalBelow: t(s.criticalBelow), criticalAbove: t(s.criticalAbove) };
}

const NUMBER_RE = /^-?\d+(\.\d+)?$/;

/** A typed limit as a number ("6,5" accepted as 6.5), or undefined if it is not one. */
export function parseLimit(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  return NUMBER_RE.test(t) ? Number(t) : undefined;
}

const plain = (metric: Metric, v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(METRIC_INFO[metric].decimals));

/** The field's own problem (empty, not a number, too many decimals, out of bounds), ignoring the others. */
function ownError(metric: Metric, text: string): string | undefined {
  if (!text.trim()) return 'Enter a number.';
  const v = parseLimit(text);
  if (v === undefined) return 'Enter a number.';
  const { decimals } = METRIC_INFO[metric];
  const typedDecimals = text.trim().replace(',', '.').split('.')[1]?.length ?? 0;
  if (typedDecimals > decimals) return decimals === 0 ? 'Use a whole number.' : `Use at most ${decimals} decimal.`;
  const [lo, hi] = LIMIT_BOUNDS[metric];
  if (v < lo || v > hi) return `Use ${lo} to ${hi}.`;
  return undefined;
}

/**
 * Error for one input of one sensor, or undefined. The order rule (critical below <= normal from
 * < normal to <= critical above) is shown on both fields of a broken pair, with the other's value,
 * so the message makes sense whichever one the user changed.
 */
export function limitFieldError(metric: Metric, field: LimitField, texts: LimitTexts): string | undefined {
  const own = ownError(metric, texts[field]);
  if (own) return own;
  const v = (f: LimitField) => (ownError(metric, texts[f]) ? undefined : parseLimit(texts[f]));
  const me = v(field) as number;
  const other = (f: LimitField) => v(f);
  const p = (x: number) => plain(metric, x);
  const gas = HIGH_SIDE_ONLY[metric];
  switch (field) {
    case 'normalMin': {
      const max = other('normalMax');
      if (max !== undefined && me >= max) return `Must be less than ${p(max)}.`;
      const below = other('criticalBelow');
      if (!gas && below !== undefined && me < below) return `Must be ${p(below)} or more.`;
      return undefined;
    }
    case 'normalMax': {
      const min = other('normalMin');
      if (min !== undefined && me <= min) return `Must be more than ${p(min)}.`;
      const above = other('criticalAbove');
      if (above !== undefined && me > above) return `Must be ${p(above)} or less.`;
      return undefined;
    }
    case 'criticalBelow': {
      const min = other('normalMin');
      if (!gas && min !== undefined && me > min) return `Must be ${p(min)} or less.`;
      return undefined;
    }
    case 'criticalAbove': {
      const max = other('normalMax');
      if (max !== undefined && me < max) return `Must be ${p(max)} or more.`;
      return undefined;
    }
  }
}

/** The sensor's limits from the form, or null while any field has an error. */
export function rangeFromTexts(metric: Metric, texts: LimitTexts): Range | null {
  if (LIMIT_FIELDS.some((f) => limitFieldError(metric, f, texts))) return null;
  const n = (f: LimitField) => parseLimit(texts[f]) as number;
  const r: Range = { normal: [n('normalMin'), n('normalMax')], warning: [n('criticalBelow'), n('criticalAbove')] };
  return validRange(metric, r) ? r : null;
}
