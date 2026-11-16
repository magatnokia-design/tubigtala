// When an alert is raised: one decision, made by the Cloud Functions (functions/src/readings.ts;
// since app 0.9.4 only the server raises alerts) and unit-tested here with the rest of the domain.
// A condition raises one alert when it gets worse; a value bouncing across a limit does not
// re-alert within the cooldown unless it gets worse than what was already alerted.
import { formatNumber } from './format.ts';
import { METRIC_INFO, normalRangeText, RANGES, type Level, type Metric, type Range } from './thresholds.ts';

export const ALERT_COOLDOWN_MS = 30 * 60_000;

const SEVERITY: Record<Level, number> = { unknown: 0, normal: 0, warning: 1, critical: 2 };

/** users/{uid}/alertState/{deviceId}_{metric} - written by the server only (since 0.9.4). */
export interface AlertState {
  /** last status seen for this device and field */
  level: 'normal' | 'warning' | 'critical';
  /** level of the last alert raised, and when (server time, ms) */
  alertLevel: 'warning' | 'critical' | null;
  alertedAtMs: number | null;
}

export function shouldAlert(state: AlertState | null, next: Level, nowMs: number): boolean {
  if (next !== 'warning' && next !== 'critical') return false;
  const previous = state?.level ?? 'normal';
  if (SEVERITY[next] <= SEVERITY[previous]) return false; // not worse than before
  if (state?.alertLevel && state.alertedAtMs !== null && nowMs - state.alertedAtMs < ALERT_COOLDOWN_MS
      && SEVERITY[state.alertLevel] >= SEVERITY[next]) {
    return false; // already alerted at this level or worse, recently: a bounce, not news
  }
  return true;
}

/**
 * What a new status means for users/{uid}/alertState: nothing changed, the level changed
 * (update the record only), or raise an alert. Used by the Cloud Function
 * (functions/src/readings.ts) inside its transaction (until 0.9.4 the open app did the same).
 * `state` in an update/raise is what to store; for a raise, alertedAtMs is `nowMs`.
 */
export type AlertStep =
  | { kind: 'none' }
  | { kind: 'update'; state: AlertState }
  | { kind: 'raise'; state: AlertState };

export function nextAlertStep(state: AlertState | null, next: Level, nowMs: number): AlertStep {
  if (next === 'unknown') return { kind: 'none' }; // a missing value says nothing about the water
  if (shouldAlert(state, next, nowMs)) {
    const level = next as 'warning' | 'critical';
    return { kind: 'raise', state: { level, alertLevel: level, alertedAtMs: nowMs } };
  }
  if (state?.level === next) return { kind: 'none' }; // nothing changed: no write
  return { kind: 'update', state: { level: next, alertLevel: state?.alertLevel ?? null, alertedAtMs: state?.alertedAtMs ?? null } };
}

// How each field is named in an alert: in the title ("Tank 2: water too hot", "Tank 2: water
// too acidic") and at the start of the body sentence ("Water is 36.2 °C.", "pH is 5.8.").
// Ammonia says "gas above the water" because the MQ sensor measures air, not the water (CLAUDE.md).
const SUBJECT: Record<Metric, { title: string; sentence: string }> = {
  ph: { title: 'water', sentence: 'pH' },
  temperatureC: { title: 'water', sentence: 'Water' },
  nh3GasMv: { title: 'ammonia gas', sentence: 'Ammonia gas above the water' },
};

/**
 * A reading with what it is: "pH 5.8", "36.2 °C", "1844 mV". pH has no unit, so it is named -
 * a bare "5.8" did not say what was measured.
 */
export function valueText(metric: Metric, value: number | null): string {
  const { unit, decimals } = METRIC_INFO[metric];
  const n = formatNumber(value, decimals);
  return metric === 'ph' ? `pH ${n}` : `${n}${unit ? ` ${unit}` : ''}`;
}

/**
 * What is wrong, without the station name - for the in-app list and details, where the station is
 * shown separately (only when there is more than one): "Water a bit warm", "Water too acidic".
 */
export function alertHeadline(metric: Metric, label: string): string {
  const text = `${SUBJECT[metric].title} ${label.toLowerCase()}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The reading and its normal range in one line: "pH 5.8 · normal 6.5 to 8.5". `range`: the limits it was checked against. */
export function alertDetail(metric: Metric, value: number | null, range: Range = RANGES[metric]): string {
  return `${valueText(metric, value)} · normal ${normalRangeText(metric, range)}`;
}

/**
 * What an out-of-range pH can mean, for the alert's details: the effects the US EPA lists for its
 * 6.5-8.5 drinking-water range, which is about taste and pipes, not a health limit - so this never
 * says the water is unsafe (CLAUDE.md). null for normal values and for the other fields.
 */
export function alertMeaning(metric: Metric, value: number | null, range: Range = RANGES[metric]): string | null {
  if (metric !== 'ph' || value === null) return null;
  if (value < range.normal[0]) return 'Lower pH means more acidic. Acidic water can taste metallic and corrode pipes.';
  if (value > range.normal[1]) return 'Higher pH means more alkaline. Alkaline water can taste like soda and leave mineral deposits.';
  return null;
}

/**
 * Title and body of an alert, written so the title alone - all a locked phone shows - says what
 * is wrong and the reading: "Tank 1: water too acidic (pH 5.8)" / "pH is 5.8. Normal is 6.5 to
 * 8.5. Lower pH means more acidic." Caveats come last: uncalibrated pH (CLAUDE.md: never assume
 * calibration) and simulated data. Gas says it is relative.
 * `opts.range`: the station's limits for this sensor (limits.ts); the defaults when left out.
 */
export function alertText(
  metric: Metric, label: string, value: number | null, deviceName: string,
  opts: { simulated: boolean; uncalibrated: boolean; range?: Range },
) {
  const info = METRIC_INFO[metric];
  const subject = SUBJECT[metric];
  const range = opts.range ?? RANGES[metric];
  const shown = `${formatNumber(value, info.decimals)}${info.unit ? ` ${info.unit}` : ''}`;
  const hint = metric === 'ph' && value !== null
    ? (value < range.normal[0] ? 'Lower pH means more acidic.' : value > range.normal[1] ? 'Higher pH means more alkaline.' : '')
    : metric === 'nh3GasMv' ? 'A relative reading, not ppm.' : '';
  const notes = [
    hint,
    opts.uncalibrated ? 'The pH sensor is not calibrated yet, so this may be off.' : '',
    opts.simulated ? 'Test data, not a real sensor.' : '',
  ].filter(Boolean);
  return {
    title: `${deviceName}: ${subject.title} ${label.toLowerCase()} (${valueText(metric, value)})`,
    body: [`${subject.sentence} is ${shown}.`, `Normal is ${normalRangeText(metric, range)}.`, ...notes].join(' '),
  };
}
