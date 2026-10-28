// Raises alerts from inside the app (until Cloud Functions do it server-side). The shared
// users/{uid}/alertState/{deviceId}_{metric} record and the alert are written in one
// transaction: all of the user's phones see the same state, so one condition raises one alert,
// and a failed write changes nothing - the next reading simply tries again.
import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';

import { alertText, shouldAlert, type AlertState } from '@/domain/alerts';
import type { Metric, Status } from '@/domain/thresholds';
import type { Device, Reading } from '@/domain/types';
import { db } from '@/services/firebase';

/** Returns the alert's title/body if this phone raised one, otherwise null. */
export async function evaluateAlert(uid: string, device: Device, reading: Reading, metric: Metric, status: Status) {
  if (status.level === 'unknown') return null; // a missing value says nothing about the water
  const stateRef = doc(db, 'users', uid, 'alertState', `${device.id}_${metric}`);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(stateRef);
    const d = snap.exists() ? snap.data() : null;
    const state: AlertState | null = d && {
      level: d.level === 'warning' || d.level === 'critical' ? d.level : 'normal',
      alertLevel: d.alertLevel === 'warning' || d.alertLevel === 'critical' ? d.alertLevel : null,
      alertedAtMs: d.alertedAt instanceof Timestamp ? d.alertedAt.toMillis() : null,
    };
    // Server time of the reading, so the cooldown does not depend on the phone's clock.
    const alert = shouldAlert(state, status.level, reading.serverTimeMs);
    if (!alert && state?.level === status.level) return null; // nothing changed: no write

    if (alert) {
      const level = status.level as 'warning' | 'critical';
      const text = alertText(metric, status.label, reading[metric], device.name, {
        simulated: device.simulated,
        uncalibrated: metric === 'ph' && !reading.phCalibrated,
      });
      tx.set(doc(db, 'users', uid, 'notifications', `${device.id}_${metric}_${reading.id}`), {
        title: text.title.slice(0, 80),
        body: text.body.slice(0, 200),
        deviceId: device.id,
        metric,
        value: reading[metric],
        level,
        readingId: reading.id,
        createdAt: serverTimestamp(),
        read: false,
      });
      tx.set(stateRef, { level, alertLevel: level, alertedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return text;
    }

    tx.set(stateRef, {
      level: status.level,
      alertLevel: state?.alertLevel ?? null,
      alertedAt: state?.alertedAtMs ? Timestamp.fromMillis(state.alertedAtMs) : null,
      updatedAt: serverTimestamp(),
    });
    return null;
  });
}
