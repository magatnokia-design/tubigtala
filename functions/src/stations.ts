// Station offline / back online alerts (docs/data-model.md, "Alert policy"), push only.
// Run every 5 minutes by the scheduled function checkStations (index.ts): a station that stops
// uploading creates no reading, so onReadingCreated can never notice it.
// "Offline" is the app's own rule (mobile/src/domain/status.ts: no reading for 15 minutes), so the
// alert and the app's Offline label always agree. One alert when a station goes offline, one when
// readings come back. State per owner and station in users/{uid}/alertState/{deviceId}_offline
// (written only here; the app's rules do not allow that ID).
// Cost per run: about 3 document reads per paired station (station list, newest reading, state).
import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { deviceStatus } from '../../mobile/src/domain/status.ts';
import { offlineChange, offlineText, onlineText } from './health.ts';
import { sendPush, type Deps, type PushAlert } from './readings.ts';

export async function checkStationsOnce(deps: Deps): Promise<void> {
  const nowMs = (deps.nowMs ?? Date.now)();
  // Unpaired stations (ownerUid null) have no one to tell.
  const paired = await deps.db.collection('devices').where('ownerUid', '!=', null).get();
  for (const d of paired.docs) {
    try {
      await checkStation(deps, d.id, d.data(), nowMs);
    } catch (e) {
      logger.error(`station check ${d.id} failed: ${String(e).slice(0, 200)}`); // the others still run
    }
  }
}

async function checkStation(deps: Deps, deviceId: string, device: DocumentData, nowMs: number): Promise<void> {
  const { db } = deps;
  const uid = device.ownerUid;
  if (typeof uid !== 'string') return;
  const readings = db.collection(`devices/${deviceId}/readings`);
  const newest = (await readings.orderBy('serverTime', 'desc').limit(1).get()).docs[0];
  const newestTime = newest?.get('serverTime');
  if (!newest || !(newestTime instanceof Timestamp)) return; // never uploaded: not offline, just not set up
  const intervalSec = typeof device.readingIntervalSec === 'number' ? device.readingIntervalSec : 60;
  const status = deviceStatus(newestTime.toMillis(), intervalSec, nowMs);
  const deviceName = typeof device.name === 'string' ? device.name : deviceId;
  const stateRef = db.doc(`users/${uid}/alertState/${deviceId}_offline`);

  const raised = await db.runTransaction(async (tx): Promise<PushAlert | null> => {
    const state = (await tx.get(stateRef)).data();
    const change = offlineChange(state?.offline === true, status);
    if (!change) return null;
    let text;
    if (change === 'offline') {
      text = offlineText(deviceName, newestTime.toMillis(), nowMs);
    } else {
      // "Resumed at": the first reading after the break (one extra read, only on this change).
      const lastBefore = state?.lastReadingAt instanceof Timestamp ? state.lastReadingAt : null;
      const first = lastBefore
        ? (await tx.get(readings.where('serverTime', '>', lastBefore).orderBy('serverTime').limit(1))).docs[0]
        : undefined;
      const firstTime = first?.get('serverTime');
      const resumedMs = firstTime instanceof Timestamp ? firstTime.toMillis() : newestTime.toMillis();
      text = onlineText(deviceName, lastBefore?.toMillis() ?? null, resumedMs, nowMs);
    }
    // One ID per break (the last reading before it / the newest after it): a re-run cannot duplicate.
    const alertId = `${deviceId}_${change}_${newest.id}`;
    tx.set(db.doc(`users/${uid}/notifications/${alertId}`), {
      title: text.title.slice(0, 80),
      body: text.body.slice(0, 200),
      deviceId,
      metric: null,
      value: null,
      level: change === 'offline' ? 'warning' : null,
      kind: change,
      readingId: newest.id,
      createdAt: FieldValue.serverTimestamp(),
      read: false,
    });
    tx.set(stateRef, { offline: change === 'offline', lastReadingAt: newestTime, changedAt: FieldValue.serverTimestamp() });
    return { metric: null, alertId, title: text.title, body: text.body };
  });
  if (!raised) return;
  logger.info(`${deviceId}: ${raised.alertId}`);
  const profile = (await db.doc(`users/${uid}`).get()).data();
  await sendPush(deps, { uid, deviceId, readingId: newest.id, profile }, [raised]);
}
