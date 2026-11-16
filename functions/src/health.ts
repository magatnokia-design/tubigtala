// Station health alerts (docs/data-model.md, "Alert policy"): a sensor that stops sending values,
// and a station that stops uploading. Push only, never SMS. Pure functions, unit-tested without
// Firebase (health.test.ts); the Firestore side is readings.ts (sensors) and stations.ts (offline).
import type { DeviceStatus } from '../../mobile/src/domain/status.ts';
import type { Metric } from '../../mobile/src/domain/thresholds.ts';
import { manilaClock, manilaKeys } from './policy.ts';

/**
 * A field without a value for this long raises "sensor not reading". Longer than the gas sensor's
 * 3-minute warm-up after every start (firmware NH3_WARMUP_MS), so a restart never alerts.
 */
export const SENSOR_MISSING_MS = 10 * 60_000;

/**
 * What a reading WITHOUT a value for a field means for that field's missing-value record
 * (users/{uid}/alertState/{deviceId}_{metric}: missingSince, missingAlertedAt):
 *  - start: first missing value (or an older one that arrived late) - remember its time
 *  - raise: missing for SENSOR_MISSING_MS and not alerted yet - one alert per episode
 *  - none:  nothing to change
 * A reading WITH a value ends the episode (readings.ts deletes the record).
 */
export function missingStep(state: { sinceMs: number | null; alerted: boolean }, readingMs: number): 'start' | 'raise' | 'none' {
  if (state.sinceMs === null || readingMs < state.sinceMs) return 'start';
  if (!state.alerted && readingMs - state.sinceMs >= SENSOR_MISSING_MS) return 'raise';
  return 'none';
}

/**
 * Whether a station's status is news. Offline itself is the app's rule (mobile/src/domain/status.ts:
 * no reading for 15 minutes), so the alert and the "Offline" label in the app always agree.
 */
export function offlineChange(wasOffline: boolean, status: DeviceStatus): 'offline' | 'online' | null {
  const isOffline = status === 'offline';
  if (isOffline === wasOffline) return null;
  return isOffline ? 'offline' : 'online';
}

/** "4:10 PM" today, "Nov 15, 4:10 PM" on another day - Philippine time, as in the SMS. */
export function manilaWhen(ms: number, nowMs: number): string {
  if (manilaKeys(ms).day === manilaKeys(nowMs).day) return manilaClock(ms);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).format(ms);
  return `${date}, ${manilaClock(ms)}`;
}

const SENSOR: Record<Metric, { title: string; value: string; check: string }> = {
  temperatureC: { title: 'temperature sensor', value: 'temperature', check: 'Check the temperature probe and its wires.' },
  ph: { title: 'pH sensor', value: 'pH', check: 'Check the pH board, the probe cable, and that the probe is in liquid.' },
  nh3GasMv: { title: 'ammonia gas sensor', value: 'ammonia gas', check: 'Check the gas sensor and its wires.' },
};

export interface AlertWords {
  title: string;
  body: string;
}

/** "TubigTala Station: temperature sensor not reading" / "No temperature value since 4:21 PM. Check ..." */
export function sensorMissingText(metric: Metric, deviceName: string, sinceMs: number, nowMs: number, simulated: boolean): AlertWords {
  const s = SENSOR[metric];
  return {
    title: `${deviceName}: ${s.title} not reading`,
    body: [`No ${s.value} value since ${manilaWhen(sinceMs, nowMs)}.`, s.check, simulated ? 'Test data, not a real sensor.' : '']
      .filter(Boolean).join(' '),
  };
}

/** "TubigTala Station: offline" / "No readings since 4:10 PM. Check its power and Wi-Fi." */
export function offlineText(deviceName: string, lastReadingMs: number, nowMs: number): AlertWords {
  return {
    title: `${deviceName}: offline`,
    body: `No readings since ${manilaWhen(lastReadingMs, nowMs)}. Check its power and Wi-Fi.`,
  };
}

/** "TubigTala Station: back online" / "Readings resumed at 4:52 PM. The last one before that was at 4:10 PM." */
export function onlineText(deviceName: string, lastBeforeMs: number | null, resumedMs: number, nowMs: number): AlertWords {
  return {
    title: `${deviceName}: back online`,
    body: [`Readings resumed at ${manilaWhen(resumedMs, nowMs)}.`, lastBeforeMs === null ? '' : `The last one before that was at ${manilaWhen(lastBeforeMs, nowMs)}.`]
      .filter(Boolean).join(' '),
  };
}
