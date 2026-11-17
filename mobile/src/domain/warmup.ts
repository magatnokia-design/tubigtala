// Sensor warm-up after the station powers on. Each reading carries `seq`: 0 at power-on, one
// more per reading (firmware tubigtala.ino), so seq x the reading interval = how long the station
// had been on.
//
// The MQ-137 gas sensor's heater needs time. The firmware sends no gas value for its first
// 3 minutes (NH3_WARMUP_MS); the values then start high and drift down. Measured on tank-01,
// 16 Nov 2026: after a power-on 1844 mV at 4 minutes, back under 1700 by 12 minutes; after a short
// restart (sensor still warm) normal straight away. So for GAS_SETTLE_MS after power-on a gas
// value says nothing yet: the Water card shows "Warming up" and the server raises no gas alert -
// one rule, used by both (functions/src/readings.ts).
//
// The first reading after power-on can also lack a value (the temperature at 18:19 that day):
// the card shows "Starting up" rather than "No reading". Simulated devices (devtools) have no
// heater, so they never warm up. Like thresholds.ts this file is compiled into the functions.
import type { Metric } from './thresholds.ts';

export const GAS_SETTLE_MS = 15 * 60_000;

export interface WarmupReading {
  /** readings since power-on (0 = the first); null when unknown (e.g. cached by an older app) */
  seq: number | null;
  simulated: boolean;
}

/** How long the station had been on when it took this reading (ms); null when unknown. */
export function uptimeMs(seq: number | null | undefined, intervalSec: number): number | null {
  return typeof seq === 'number' && Number.isFinite(seq) && seq >= 0 ? seq * intervalSec * 1000 : null;
}

/** Warm-up time the gas sensor still had left at this reading (ms); 0 when done, unknown or simulated. */
export function gasWarmupLeftMs(r: WarmupReading, intervalSec: number): number {
  if (r.simulated) return 0;
  const up = uptimeMs(r.seq, intervalSec);
  return up === null ? 0 : Math.max(0, GAS_SETTLE_MS - up);
}

/** Warm-up time left now (ms): what was left at the reading, minus the time since it was taken. */
export function gasWarmupLeftNowMs(r: WarmupReading & { serverTimeMs: number }, intervalSec: number, nowMs: number): number {
  return Math.max(0, gasWarmupLeftMs(r, intervalSec) - Math.max(0, nowMs - r.serverTimeMs));
}

/** "about 8 min" left, never less than 1 (the next reading decides when it is over). */
export const warmupMinutesLeft = (leftMs: number) => Math.max(1, Math.ceil(leftMs / 60_000));

/** True when this field's value in this reading does not count yet (only gas has a warm-up). */
export function warmingUp(metric: Metric, r: WarmupReading, intervalSec: number): boolean {
  return metric === 'nh3GasMv' && gasWarmupLeftMs(r, intervalSec) > 0;
}

/** The first reading after power-on, where a missing value means "starting", not "no reading". */
export const isFirstReading = (r: WarmupReading) => r.seq === 0 && !r.simulated;
