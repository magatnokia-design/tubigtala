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

/** Title and body of an alert. Uncalibrated pH says so (CLAUDE.md: never assume calibration). */
export function alertText(metric: Metric, label: string, value: number | null, deviceName: string, opts: { simulated: boolean; uncalibrated: boolean }) {
  const info = METRIC_INFO[metric];
  const qualifier = opts.uncalibrated ? ' (uncalibrated)' : '';
  const shown = `${formatNumber(value, info.decimals)}${info.unit ? ` ${info.unit}` : ''}`;
  return {
    title: `${info.name}: ${label}${qualifier}`,
    body: `${deviceName}${opts.simulated ? ' (simulated)' : ''} · ${shown}${qualifier} · normal ${normalRangeText(metric)}`,
  };
}
