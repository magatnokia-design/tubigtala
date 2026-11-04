// Delivery policy for SMS and email (docs/data-model.md, "Alert policy"). Pure functions only,
// so every rule here is unit-tested without Firebase. Which readings are normal/warning/critical
// is NOT decided here: that is mobile/src/domain/thresholds.ts, shared with the app.
import { formatNumber } from '../../mobile/src/domain/format.ts';
import { classify, METRIC_INFO, RANGES, type Metric } from '../../mobile/src/domain/thresholds.ts';

/** SMS needs this many critical readings in a row, so one bad reading does not cost a text. */
export const SMS_STREAK = 3;
/** TextBee plan: 300 SMS/month for the whole account. 50 are kept for testing. */
export const SMS_DAY_CAP = 5;
export const SMS_MONTH_CAP = 250;

const MANILA_OFFSET_MS = 8 * 3_600_000; // UTC+8, no daylight saving

/** Calendar day and month in Philippine time, e.g. { day: '2026-11-04', month: '2026-11' }. */
export function manilaKeys(nowMs: number): { day: string; month: string } {
  const iso = new Date(nowMs + MANILA_OFFSET_MS).toISOString();
  return { day: iso.slice(0, 10), month: iso.slice(0, 7) };
}

/**
 * SMS is only for critical pH and temperature. pH must be calibrated: an uncalibrated reading is
 * not trustworthy enough to text about. Ammonia gas never, until its ranges are measured.
 */
export function smsMetricAllowed(metric: Metric, phCalibrated: boolean): boolean {
  return metric === 'temperatureC' || (metric === 'ph' && phCalibrated);
}

/** True when the newest SMS_STREAK values (newest first) are all critical. Missing values break the streak. */
export function isCriticalStreak(metric: Metric, newestFirst: unknown[]): boolean {
  if (newestFirst.length < SMS_STREAK) return false;
  return newestFirst.slice(0, SMS_STREAK).every((v) => classify(metric, typeof v === 'number' ? v : null).level === 'critical');
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

/** "4 Nov 2026, 3:42 PM" in Philippine time. */
export function manilaDateTime(ms: number): string {
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
  return `${date}, ${manilaClock(ms)}`;
}

export interface SmsItem {
  metric: Metric;
  /** status word from classify(), e.g. "Too high" */
  label: string;
  value: number;
}

const SMS_SUBJECT: Record<Metric, string> = { ph: 'pH', temperatureC: 'water', nh3GasMv: 'ammonia gas' };

// Characters kept from a device name: plain GSM-7 ones. Anything else (emoji, "°") would switch
// the SMS to UCS-2, which fits 70 characters instead of 160 and can cost two or three texts.
const gsmSafe = (s: string) => s.replace(/[^A-Za-z0-9 .,:;()'!?#&+\-_/]/g, '').trim();

/**
 * One SMS for all critical fields of one reading, within 160 GSM characters:
 * "TubigTala: Tank 1 pH TOO HIGH 9.4 (normal 6.5-8.5) at 3:42 PM"
 */
export function smsText(deviceName: string, items: SmsItem[], atMs: number): string {
  const parts = items.map(({ metric, label, value }) => {
    const { decimals } = METRIC_INFO[metric];
    const unit = metric === 'temperatureC' ? ' C' : '';
    const [lo, hi] = RANGES[metric].normal;
    return `${SMS_SUBJECT[metric]} ${label.toUpperCase()} ${formatNumber(value, decimals)}${unit} (normal ${lo}-${hi}${unit})`;
  });
  return `TubigTala: ${gsmSafe(deviceName) || 'device'} ${parts.join('; ')} at ${manilaClock(atMs)}`;
}

export interface EmailAlert {
  title: string;
  body: string;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const DISCLAIMER = 'TubigTala is a prototype. Its sensors are not a laboratory test and cannot certify that water is safe to drink.';

/** One email for all alerts raised by one reading. Simulated data is marked in the subject. */
export function emailContent(deviceName: string, alerts: EmailAlert[], atMs: number, simulated: boolean) {
  const subject = `${simulated ? '[Test data] ' : ''}${alerts.length === 1 ? alerts[0].title : `${deviceName}: ${alerts.length} alerts`}`;
  const when = `${manilaDateTime(atMs)} (Philippine time)`;
  const text = [
    ...alerts.map((a) => `- ${a.title}\n  ${a.body}`),
    '',
    `Reading time: ${when}`,
    'Open the TubigTala app for the latest readings.',
    '',
    DISCLAIMER,
  ].join('\n');
  const html = [
    ...alerts.map((a) => `<p><strong>${escapeHtml(a.title)}</strong><br>${escapeHtml(a.body)}</p>`),
    `<p>Reading time: ${escapeHtml(when)}<br>Open the TubigTala app for the latest readings.</p>`,
    `<p style="color:#5b6b77;font-size:12px">${escapeHtml(DISCLAIMER)}</p>`,
  ].join('\n');
  return { subject, text, html };
}

/** "+63917*****67": enough to tell numbers apart in logs without exposing them (CLAUDE.md). */
export function maskPhone(phone: string): string {
  return phone.length > 7 ? `${phone.slice(0, 6)}${'*'.repeat(phone.length - 8)}${phone.slice(-2)}` : '***';
}

/** "j***@gmail.com" */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? `${email[0]}***${email.slice(at)}` : '***';
}
