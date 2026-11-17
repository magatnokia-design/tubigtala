// Delivery policy for SMS (docs/data-model.md, "Alert policy"). No email: dropped 13 Nov 2026. Pure functions only,
// so every rule here is unit-tested without Firebase. Which readings are normal/warning/critical
// is NOT decided here: that is mobile/src/domain/thresholds.ts, shared with the app.
import { formatNumber } from '../../mobile/src/domain/format.ts';
import { HIGH_SIDE_ONLY } from '../../mobile/src/domain/limits.ts';
import { classify, METRIC_INFO, RANGES, type Metric, type Range } from '../../mobile/src/domain/thresholds.ts';

/** SMS needs this many critical readings in a row, so one bad reading does not cost a text. */
export const SMS_STREAK = 3;
/**
 * TextBee free plan: 50/day, 300/month for the whole account, received messages included, and
 * the account and phone are shared with another project (Smilebook, usage unknown). So TubigTala
 * keeps to 5/day and 100/month (decided 16 Nov 2026).
 */
export const SMS_DAY_CAP = 5;
export const SMS_MONTH_CAP = 100;

const MANILA_OFFSET_MS = 8 * 3_600_000; // UTC+8, no daylight saving

/** Calendar day and month in Philippine time, e.g. { day: '2026-11-04', month: '2026-11' }. */
export function manilaKeys(nowMs: number): { day: string; month: string } {
  const iso = new Date(nowMs + MANILA_OFFSET_MS).toISOString();
  return { day: iso.slice(0, 10), month: iso.slice(0, 7) };
}

/**
 * SMS is for critical temperature, ammonia gas and calibrated pH. pH must be calibrated: an
 * uncalibrated reading is not trustworthy enough to text about. Ammonia gas since 17 Nov 2026
 * (app 0.9.7): it was left out while its warm-up after a power-on raised false "too high" alerts;
 * the warm-up is now held back (domain/warmup.ts), its limits come from the measured clean-air
 * baseline, and its SMS says "mV" - a relative reading, never ppm.
 */
export function smsMetricAllowed(metric: Metric, phCalibrated: boolean): boolean {
  return metric === 'temperatureC' || metric === 'nh3GasMv' || (metric === 'ph' && phCalibrated);
}

/**
 * True when the newest SMS_STREAK values (newest first) are all critical with the station's limits
 * as they are now (`range`; the defaults when left out). Missing values break the streak - pass
 * null for a value that does not count yet (the gas sensor's warm-up), so it breaks it too.
 */
export function isCriticalStreak(metric: Metric, newestFirst: unknown[], range: Range = RANGES[metric]): boolean {
  if (newestFirst.length < SMS_STREAK) return false;
  return newestFirst.slice(0, SMS_STREAK).every((v) => classify(metric, typeof v === 'number' ? v : null, range).level === 'critical');
}

/** smsBudget/global - SMS sent per Philippine day and month, across all users and devices. */
export interface SmsBudget {
  day: string;
  dayCount: number;
  month: string;
  monthCount: number;
}

export type Reservation = { ok: true; next: SmsBudget } | { ok: false; reason: 'day' | 'month' };

/** Reserve `count` SMS (one per recipient) against the caps; counters restart each day/month. */
export function reserveSms(budget: SmsBudget | null, nowMs: number, count: number): Reservation {
  const { day, month } = manilaKeys(nowMs);
  const monthCount = budget?.month === month ? budget.monthCount : 0;
  const dayCount = budget?.day === day ? budget.dayCount : 0;
  if (monthCount + count > SMS_MONTH_CAP) return { ok: false, reason: 'month' };
  if (dayCount + count > SMS_DAY_CAP) return { ok: false, reason: 'day' };
  return { ok: true, next: { day, dayCount: dayCount + count, month, monthCount: monthCount + count } };
}

/** "3:42 PM" in Philippine time, with plain spaces (ICU uses a narrow no-break space, which is not GSM). */
export function manilaClock(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })
    .format(ms).replace(/\s+/g, ' ');
}

export interface SmsItem {
  metric: Metric;
  /** status word from classify(), e.g. "Too high" */
  label: string;
  value: number;
  /** the station's limits it was checked against; the defaults when left out */
  range?: Range;
}

const SMS_SUBJECT: Record<Metric, string> = { ph: 'pH', temperatureC: 'water', nh3GasMv: 'ammonia gas' };

// Characters kept from a device name: plain GSM-7 ones. Anything else (emoji, "°") would switch
// the SMS to UCS-2, which fits 70 characters instead of 160 and can cost two or three texts.
const gsmSafe = (s: string) => s.replace(/[^A-Za-z0-9 .,:;()'!?#&+\-_/]/g, '').trim();

/** One SMS is 160 GSM-7 characters; longer splits into several texts, each costing load. */
export const SMS_MAX_CHARS = 160;

const SMS_UNIT: Record<Metric, string> = { ph: '', temperatureC: ' C', nh3GasMv: ' mV' };

/**
 * One SMS for all critical fields of one reading, within 160 GSM characters:
 * "TubigTala: Tank 1 pH 5.8 TOO ACIDIC (normal 6.5-8.5) at 3:42 PM" /
 * "TubigTala: Tank 1 ammonia gas 2534 mV TOO HIGH (normal up to 1700 mV) at 8:51 AM" - the
 * reading next to what was measured, then the status word (same words as the app, thresholds.ts).
 * If it would not fit (all three fields critical at once), the normal ranges are left out (they
 * are in the app), and only then is the station name shortened.
 */
export function smsText(deviceName: string, items: SmsItem[], atMs: number): string {
  const part = ({ metric, label, value, range }: SmsItem, withRange: boolean) => {
    const { decimals } = METRIC_INFO[metric];
    const unit = SMS_UNIT[metric];
    const reading = `${SMS_SUBJECT[metric]} ${formatNumber(value, decimals)}${unit} ${label.toUpperCase()}`;
    if (!withRange) return reading;
    const [lo, hi] = (range ?? RANGES[metric]).normal;
    // Gas is checked on the high side only: "up to 1700 mV". Otherwise "20-32", or "-5 to 30"
    // when a limit is below zero ("-5-30" would be unreadable).
    const span = HIGH_SIDE_ONLY[metric] ? `up to ${hi}` : lo < 0 ? `${lo} to ${hi}` : `${lo}-${hi}`;
    return `${reading} (normal ${span}${unit})`;
  };
  const at = ` at ${manilaClock(atMs)}`;
  const build = (name: string, withRange: boolean) =>
    `TubigTala: ${name} ${items.map((i) => part(i, withRange)).join('; ')}${at}`;
  const name = gsmSafe(deviceName) || 'device';
  let text = build(name, true);
  if (text.length > SMS_MAX_CHARS) text = build(name, false);
  if (text.length > SMS_MAX_CHARS) text = build(name.slice(0, Math.max(1, name.length - (text.length - SMS_MAX_CHARS))).trim(), false);
  return text;
}

/** "+63917*****67": enough to tell numbers apart in logs without exposing them (CLAUDE.md). */
export function maskPhone(phone: string): string {
  return phone.length > 7 ? `${phone.slice(0, 6)}${'*'.repeat(phone.length - 8)}${phone.slice(-2)}` : '***';
}
