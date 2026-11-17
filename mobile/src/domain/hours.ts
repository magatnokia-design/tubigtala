// Hourly packs: devices/{id}/hours/{hourId} holds every reading of one UTC hour, written by the
// backend for each new reading (functions/src/hours.ts, from onReadingCreated). Views of long
// periods - Analytics By date (up to 31 days since app 0.9.7) and the Excel export - read these
// instead of the readings one by one: a month is at most 744 documents instead of up to 44,640
// (each a Firestore read; the free tier allows 50,000 a day). The readings stay the record; a
// pack is a copy the server can rebuild from them (scratchpad backfill, docs/data-model.md).
// Shared by the app (unpack) and the Cloud Functions (pack): keep it free of app-only imports.
import type { Reading } from './types.ts';

export const HOUR_MS = 3_600_000;

/** Start of the UTC hour containing `ms`. */
export const hourStartOf = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS;

/** "2026111708": the UTC hour containing `ms`, sortable as text - the pack's document ID. */
export function hourIdOf(ms: number): string {
  return new Date(hourStartOf(ms)).toISOString().slice(0, 13).replace(/[-T]/g, '');
}

/**
 * One reading in a pack, a compact array so a month of packs stays small (~3 MB):
 * [ms after the hour's start, ph, phCalibrated (1 or 0), temperatureC, nh3GasMv, seq].
 * null = no value, as in the reading itself (never 0).
 */
export type PackedReading = [number, number | null, 0 | 1, number | null, number | null, number | null];

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Packs a reading (server time `serverTimeMs`) for the hour it falls in. */
export function packReading(r: {
  serverTimeMs: number; ph: unknown; phCalibrated: unknown; temperatureC: unknown; nh3GasMv: unknown; seq: unknown;
}): PackedReading {
  return [r.serverTimeMs - hourStartOf(r.serverTimeMs), num(r.ph), r.phCalibrated === true ? 1 : 0, num(r.temperatureC), num(r.nh3GasMv), num(r.seq)];
}

/**
 * The readings in one pack (`r`: reading ID -> PackedReading), oldest first. Malformed entries are
 * skipped, never turned into zeros. `simulated` comes from the device (packs do not repeat it).
 */
export function unpackHour(startMs: number, r: unknown, simulated: boolean): Reading[] {
  if (!r || typeof r !== 'object') return [];
  const out: Reading[] = [];
  for (const [id, p] of Object.entries(r as Record<string, unknown>)) {
    if (!Array.isArray(p) || p.length < 6) continue;
    const offset = num(p[0]);
    if (offset === null || offset < 0 || offset >= HOUR_MS) continue;
    out.push({
      id,
      serverTimeMs: startMs + offset,
      deviceTimeMs: null,
      seq: num(p[5]),
      ph: num(p[1]),
      phCalibrated: p[2] === 1,
      phMv: null,
      temperatureC: num(p[3]),
      nh3GasMv: num(p[4]),
      simulated,
      firmware: '',
    });
  }
  return out.sort((a, b) => a.serverTimeMs - b.serverTimeMs);
}
