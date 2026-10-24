// Device status: the one implementation of the rule in docs/data-model.md
// ("Device status"). When Cloud Functions need it, move this to shared code - don't copy it.

export type DeviceStatus = 'no-data' | 'live' | 'stale' | 'offline';

/** A device is stale once this many reading intervals pass without a reading. */
export const STALE_AFTER_INTERVALS = 3;
/** A device is offline once its newest reading is older than this. */
export const OFFLINE_AFTER_MS = 15 * 60 * 1000;

export function deviceStatus(latestServerTimeMs: number | null, readingIntervalSec: number, nowMs: number): DeviceStatus {
  if (latestServerTimeMs === null) return 'no-data';
  const ageMs = nowMs - latestServerTimeMs;
  if (ageMs > OFFLINE_AFTER_MS) return 'offline';
  if (ageMs > STALE_AFTER_INTERVALS * readingIntervalSec * 1000) return 'stale';
  return 'live';
}
