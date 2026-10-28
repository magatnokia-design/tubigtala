// Firestore access for devices and readings (docs/data-model.md). Converts documents to the
// app types and keeps null sensor values as null.
import {
  collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc, where,
  type DocumentData, type FirestoreError, type QueryDocumentSnapshot, type Unsubscribe,
} from 'firebase/firestore';

import { CALIBRATION_METHOD } from '@/domain/calibration';
import type { Device, Reading } from '@/domain/types';
import { db } from '@/services/firebase';

const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const millisOrNull = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);

function toDevice(s: QueryDocumentSnapshot<DocumentData>): Device {
  const d = s.data();
  return {
    id: s.id,
    name: typeof d.name === 'string' ? d.name : s.id,
    simulated: d.simulated === true,
    readingIntervalSec: typeof d.readingIntervalSec === 'number' && d.readingIntervalSec > 0 ? d.readingIntervalSec : 60,
    phCalibration: {
      status: d.phCalibration?.status === 'calibrated' ? 'calibrated' : 'uncalibrated',
      calibratedAtMs: millisOrNull(d.phCalibration?.calibratedAt),
      ph7Mv: numOrNull(d.phCalibration?.ph7Mv),
      ph4Mv: numOrNull(d.phCalibration?.ph4Mv),
    },
  };
}

function toReading(s: QueryDocumentSnapshot<DocumentData>): Reading | null {
  // 'estimate' fills in serverTime for writes still pending locally.
  const d = s.data({ serverTimestamps: 'estimate' });
  const serverTimeMs = millisOrNull(d.serverTime);
  if (serverTimeMs === null) return null; // malformed - cannot place it in time
  return {
    id: s.id,
    serverTimeMs,
    deviceTimeMs: millisOrNull(d.deviceTime),
    ph: numOrNull(d.ph),
    phCalibrated: d.phCalibrated === true,
    phMv: numOrNull(d.phMv),
    temperatureC: numOrNull(d.temperatureC),
    nh3GasMv: numOrNull(d.nh3GasMv),
    simulated: d.simulated === true,
    firmware: typeof d.firmware === 'string' ? d.firmware : '',
  };
}

const readingsOf = (deviceId: string) => collection(db, 'devices', deviceId, 'readings');

export function subscribeOwnedDevices(
  uid: string, onData: (devices: Device[]) => void, onError: (e: FirestoreError) => void,
): Unsubscribe {
  // The ownerUid filter is required: the rules deny any device query without it.
  const q = query(collection(db, 'devices'), where('ownerUid', '==', uid));
  return onSnapshot(q, (snap) => onData(snap.docs.map(toDevice).sort((a, b) => a.name.localeCompare(b.name))), onError);
}

export function subscribeLatestReading(
  deviceId: string, onData: (reading: Reading | null) => void, onError: (e: FirestoreError) => void,
): Unsubscribe {
  const q = query(readingsOf(deviceId), orderBy('serverTime', 'desc'), limit(1));
  return onSnapshot(q, (snap) => onData(snap.docs.length ? toReading(snap.docs[0]) : null), onError);
}

/**
 * Cap on readings fetched per chart or export. Each document read counts against the Spark
 * free tier (50k reads/day); a week (MAX_RANGE_DAYS) at one reading per minute is 10,080.
 */
export const HISTORY_LIMIT = 10_080;

/**
 * Readings since `sinceMs`, oldest first. `truncated` is true when the cap was hit, i.e. the
 * oldest part of the range is missing - the UI must say so rather than draw a shorter chart.
 */
export function subscribeReadingsSince(
  deviceId: string, sinceMs: number,
  onData: (result: { readings: Reading[]; truncated: boolean }) => void, onError: (e: FirestoreError) => void,
): Unsubscribe {
  const q = query(
    readingsOf(deviceId),
    where('serverTime', '>=', Timestamp.fromMillis(sinceMs)),
    orderBy('serverTime', 'desc'),
    limit(HISTORY_LIMIT),
  );
  return onSnapshot(
    q,
    (snap) => onData({
      readings: snap.docs.map(toReading).filter((r): r is Reading => r !== null).reverse(),
      truncated: snap.size >= HISTORY_LIMIT,
    }),
    onError,
  );
}

/** Saves a two-point pH calibration; the board picks it up within ~10 minutes. */
export function saveCalibration(deviceId: string, ph7Mv: number, ph4Mv: number): Promise<void> {
  return updateDoc(doc(db, 'devices', deviceId), {
    phCalibration: { status: 'calibrated', calibratedAt: serverTimestamp(), method: CALIBRATION_METHOD, ph7Mv, ph4Mv },
  });
}

/** Back to the firmware's nominal constants (readings flagged uncalibrated). */
export function resetCalibration(deviceId: string): Promise<void> {
  return updateDoc(doc(db, 'devices', deviceId), { phCalibration: { status: 'uncalibrated', calibratedAt: null, method: null } });
}

export function renameDevice(deviceId: string, name: string): Promise<void> {
  return updateDoc(doc(db, 'devices', deviceId), { name: name.trim() });
}

const betweenQuery = (deviceId: string, startMs: number, endMs: number) => query(
  readingsOf(deviceId),
  where('serverTime', '>=', Timestamp.fromMillis(startMs)),
  where('serverTime', '<=', Timestamp.fromMillis(endMs)),
  orderBy('serverTime', 'desc'),
  limit(HISTORY_LIMIT),
);

const toResult = (docs: QueryDocumentSnapshot<DocumentData>[]) => ({
  readings: docs.map(toReading).filter((r): r is Reading => r !== null).reverse(),
  truncated: docs.length >= HISTORY_LIMIT,
});

/** Live readings between two times (oldest first); updates as new readings arrive. */
export function subscribeReadingsBetween(
  deviceId: string, startMs: number, endMs: number,
  onData: (result: { readings: Reading[]; truncated: boolean }) => void, onError: (e: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(betweenQuery(deviceId, startMs, endMs), (snap) => onData(toResult(snap.docs)), onError);
}

/** One-off fetch for exports. */
export async function fetchReadingsBetween(deviceId: string, startMs: number, endMs: number) {
  return toResult((await getDocs(betweenQuery(deviceId, startMs, endMs))).docs);
}
