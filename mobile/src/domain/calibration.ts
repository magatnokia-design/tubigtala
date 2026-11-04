// Two-point pH calibration (pH 7 and pH 4 buffers). The formula must match phFromMv() in
// firmware/tubigtala/tubigtala.ino - the board applies the saved voltages, the app only
// previews the result.

/** Buffer voltages closer than this mean the probe is not responding (also enforced by the rules). */
export const MIN_BUFFER_GAP_MV = 100;
/** More than this between pH 7 and pH 4 is beyond what the probe module can produce. */
export const MAX_BUFFER_GAP_MV = 1500;
/** Readings within this of each other count as settled. */
export const STABLE_WITHIN_MV = 5;
/** How many recent readings must agree before a buffer value can be saved. */
export const STABLE_READINGS = 3;

export const CALIBRATION_METHOD = 'Two-point, pH 7 and pH 4 buffers (app)';

/** Linear fit through the two buffer points. */
export function phFromMv(mv: number, ph7Mv: number, ph4Mv: number): number {
  const slope = (7 - 4) / (ph7Mv - ph4Mv);
  return 7 + (mv - ph7Mv) * slope;
}

/** Probe sensitivity in mV per pH unit (absolute). */
export function mvPerPh(ph7Mv: number, ph4Mv: number): number {
  return Math.abs(ph7Mv - ph4Mv) / 3;
}

export function calibrationError(ph7Mv: number, ph4Mv: number): string | undefined {
  const gap = Math.abs(ph7Mv - ph4Mv);
  if (gap < MIN_BUFFER_GAP_MV) {
    return 'The two buffers read almost the same. Check the probe is in the right buffer and connected, then try again.';
  }
  if (gap > MAX_BUFFER_GAP_MV) return 'The difference between the buffers is too large. Repeat both steps.';
  return undefined;
}

export interface Stability {
  stable: boolean;
  /** average of the readings that were compared, null if not enough readings */
  value: number | null;
  /** spread (max - min) of those readings */
  spread: number | null;
}

/** Looks at the most recent readings (oldest first); stable when the last few agree. */
export function stability(mvs: (number | null)[]): Stability {
  const recent = mvs.filter((v): v is number => v !== null && Number.isFinite(v)).slice(-STABLE_READINGS);
  if (recent.length < STABLE_READINGS) {
    return { stable: false, value: recent.length ? recent[recent.length - 1] : null, spread: null };
  }
  const spread = Math.max(...recent) - Math.min(...recent);
  const value = recent.reduce((a, b) => a + b, 0) / recent.length;
  return { stable: spread <= STABLE_WITHIN_MV, value: Math.round(value), spread };
}
