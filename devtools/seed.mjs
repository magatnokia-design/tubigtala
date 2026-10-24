// Seeds the local emulator: a demo owner, a simulated device account, the device document,
// and 24 h of backfilled simulated readings so the history screen has data.
// Usage (emulators running): npm run seed
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { PROJECT_ID, AUTH_HOST, FIRESTORE_HOST, FIRESTORE_PORT, DEMO_OWNER, DEMO_DEVICE } from './emulator.mjs';
import { nextValues, initialState } from './simulated-values.mjs';

process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;

initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

async function upsertUser({ email, password }) {
  try {
    return await auth.getUserByEmail(email);
  } catch {
    return auth.createUser({ email, password });
  }
}

const owner = await upsertUser(DEMO_OWNER);
const device = await upsertUser(DEMO_DEVICE);

const deviceRef = db.doc(`devices/${DEMO_DEVICE.id}`);
await deviceRef.set({
  name: 'Simulated tank',
  ownerUid: owner.uid,
  deviceUid: device.uid,
  simulated: true,
  readingIntervalSec: DEMO_DEVICE.readingIntervalSec,
  phCalibration: { status: 'uncalibrated', calibratedAt: null, method: null },
  createdAt: FieldValue.serverTimestamp(),
});

// Backfill: one reading every 10 min for the past 24 h. Admin writes bypass the rules,
// which is the only way to set past serverTime values. All are marked simulated.
const batch = db.batch();
const now = Date.now();
let state = initialState();
for (let i = 144; i >= 1; i--) {
  const t = now - i * 10 * 60 * 1000;
  state = nextValues(state, t);
  const seq = 144 - i;
  batch.set(deviceRef.collection('readings').doc(`backfill-${seq}`), {
    bootId: 'backfill',
    seq,
    serverTime: Timestamp.fromMillis(t),
    deviceTime: Timestamp.fromMillis(t),
    ...state.values,
    simulated: true,
    firmware: 'devtools-seed',
  });
}
await batch.commit();

console.log(`Seeded device ${DEMO_DEVICE.id} with 144 backfilled readings.`);
console.log(`Sign in to the app with ${DEMO_OWNER.email} / ${DEMO_OWNER.password}`);
process.exit(0);
