// Simulated device: signs in as the device account and writes a reading every interval,
// through the same Security Rules a real ESP32 will face. Every reading is marked simulated.
// Usage (emulators running, after npm run seed): npm run simulate
//   npm run simulate -- --alert=ph    first 12 readings (~2 min) are critical for one field
//                                      (ph, temp or nh3), then back to normal - to see an alert
// Stop with Ctrl+C - the app should then show the device going stale, then offline.
import { randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { PROJECT_ID, AUTH_HOST, FIRESTORE_HOST, FIRESTORE_PORT, DEMO_DEVICE } from './emulator.mjs';
import { nextValues, initialState } from './simulated-values.mjs';

const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'demo-key' });
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, FIRESTORE_HOST, FIRESTORE_PORT);

await signInWithEmailAndPassword(auth, DEMO_DEVICE.email, DEMO_DEVICE.password);

// Out-of-range values used by --alert (critical for the placeholder ranges in
// mobile/src/domain/thresholds.ts).
const ALERT_VALUES = { ph: { ph: 9.4 }, temp: { temperatureC: 36.5 }, nh3: { nh3GasMv: 1100 } };
const alertArg = process.argv.find((a) => a.startsWith('--alert='))?.split('=')[1];
if (alertArg && !ALERT_VALUES[alertArg]) {
  console.error('--alert must be ph, temp or nh3');
  process.exit(1);
}
let alertReadingsLeft = alertArg ? 12 : 0;

const bootId = randomBytes(4).toString('hex');
let seq = 0;
let state = initialState();
console.log(`Simulating ${DEMO_DEVICE.id} (boot ${bootId}) every ${DEMO_DEVICE.readingIntervalSec}s. Ctrl+C to stop.`);

async function send() {
  state = nextValues(state, Date.now());
  const reading = {
    bootId,
    seq,
    serverTime: serverTimestamp(),
    deviceTime: Timestamp.now(),
    ...state.values,
    ...(alertReadingsLeft > 0 ? ALERT_VALUES[alertArg] : {}),
    simulated: true,
    firmware: 'devtools-sim',
  };
  try {
    await setDoc(doc(db, `devices/${DEMO_DEVICE.id}/readings/${bootId}-${seq}`), reading);
    if (alertReadingsLeft > 0 && --alertReadingsLeft === 0) console.log('Alert values done; back to normal.');
    console.log(`#${seq} pH ${reading.ph ?? '—'}  ${reading.temperatureC ?? '—'} °C  NH3 gas ${reading.nh3GasMv ?? '—'} mV`);
    seq++;
  } catch (err) {
    console.error(`#${seq} rejected: ${err.code ?? err.message}`);
  }
}

await send();
setInterval(send, DEMO_DEVICE.readingIntervalSec * 1000);
