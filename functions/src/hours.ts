// Adds each new reading to its hourly pack, devices/{id}/hours/{hourId} (mobile/src/domain/hours.ts,
// docs/data-model.md): what the app reads for long periods (By date up to 31 days, exports).
// set(..., { merge: true }) on the reading's own key: no read, one write, and a retried run writes
// the same value again - never a duplicate.
import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';

import { hourIdOf, hourStartOf, packReading } from '../../mobile/src/domain/hours.ts';

export async function packIntoHour(db: Firestore, deviceId: string, readingId: string, reading: DocumentData): Promise<boolean> {
  if (!(reading.serverTime instanceof Timestamp)) return false; // cannot be placed in time
  const t = reading.serverTime.toMillis();
  await db.doc(`devices/${deviceId}/hours/${hourIdOf(t)}`).set(
    {
      start: Timestamp.fromMillis(hourStartOf(t)),
      r: {
        [readingId]: packReading({
          serverTimeMs: t, ph: reading.ph, phCalibrated: reading.phCalibrated,
          temperatureC: reading.temperatureC, nh3GasMv: reading.nh3GasMv, seq: reading.seq,
        }),
      },
    },
    { merge: true },
  );
  return true;
}
