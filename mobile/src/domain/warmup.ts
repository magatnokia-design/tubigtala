// Sensor warm-up after the station powers on. Each reading carries `seq`: 0 at power-on, one
// more per reading (firmware tubigtala.ino), so seq x the reading interval = how long the station
// had been on.
//
// The MQ-137 gas sensor's heater needs time. The firmware sends no gas value for its first
// 3 minutes (NH3_WARMUP_MS); the values then start high and drift down, for longer the longer the
// station was off. Measured on tank-01 (normal = up to 1700 mV):
//   off ~8 minutes (16 Nov):  1844 mV at 4 min, under 1700 by 12 min
//   off 13 hours   (17 Nov):  2552 mV at 4 min, 1746 at 15 min, ~1700 by about 20 min
//   off 6 days     (13 Nov):  2491 mV at 3 min, 1730 at 28 min, under 1700 at 48 min
// A short restart (sensor still warm) is normal straight away. So for GAS_SETTLE_MS after power-on
// a gas value says nothing yet: the Water card shows "Warming up" and the server raises no gas
// alert - one rule, used by both (functions/src/readings.ts). 15 minutes (0.9.5) was too short:
// the 13-hour case raised "a bit high (1746 mV)" the minute it ended. 30 minutes (0.9.6, decided
// 17 Nov 2026) covers restarts and overnight power-offs; after several days off one "a bit high"
// warning can still follow (gas never sends SMS). Longer would also hide a real rise for longer.
//
// The first reading after power-on can also lack a value (the temperature at 18:19 that day):
// the card shows "Starting up" rather than "No reading". Simulated devices (devtools) have no
// heater, so they never warm up. Like thresholds.ts this file is compiled into the functions.
import type { Metric } from './thresholds.ts';

export const GAS_SETTLE_MS = 30 * 60_000;

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
