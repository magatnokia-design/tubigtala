// When an alert is raised: one decision, used by the app now and by Cloud Functions later.
// A condition raises one alert when it gets worse; a value bouncing across a limit does not
// re-alert within the cooldown unless it gets worse than what was already alerted.
import { formatNumber } from './format.ts';
import { METRIC_INFO, normalRangeText, type Level, type Metric } from './thresholds.ts';

export const ALERT_COOLDOWN_MS = 30 * 60_000;

const SEVERITY: Record<Level, number> = { unknown: 0, normal: 0, warning: 1, critical: 2 };

/** users/{uid}/alertState/{deviceId}_{metric} - shared by all of the user's phones. */
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

// How each field is named in an alert: in the title ("Tank 2: water too hot") and at the
// start of the body sentence ("Water is 36.2 °C."). Ammonia says "gas above the water"
// because the MQ sensor measures air, not the water itself (CLAUDE.md).
const SUBJECT: Record<Metric, { title: string; sentence: string }> = {
  ph: { title: 'pH', sentence: 'pH' },
  temperatureC: { title: 'water', sentence: 'Water' },
  nh3GasMv: { title: 'ammonia gas', sentence: 'Ammonia gas above the water' },
};

/**
 * Title and body of an alert, written so the title alone says what is wrong:
 * "Tank 1: pH too high" / "pH is 9.4. Normal is 6.5 to 8.5."
 * Caveats come last: uncalibrated pH (CLAUDE.md: never assume calibration) and simulated data.
 */
export function alertText(metric: Metric, label: string, value: number | null, deviceName: string, opts: { simulated: boolean; uncalibrated: boolean }) {
  const info = METRIC_INFO[metric];
  const subject = SUBJECT[metric];
  const shown = `${formatNumber(value, info.decimals)}${info.unit ? ` ${info.unit}` : ''}`;
  const notes = [
    opts.uncalibrated ? 'The pH sensor is not calibrated yet, so this may be off.' : '',
    opts.simulated ? 'Test data, not a real sensor.' : '',
  ].filter(Boolean);
  return {
    title: `${deviceName}: ${subject.title} ${label.toLowerCase()}`,
    body: [`${subject.sentence} is ${shown}.`, `Normal is ${normalRangeText(metric)}.`, ...notes].join(' '),
  };
}
