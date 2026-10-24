// Simulated device: signs in as the device account and writes a reading every interval,
// through the same Security Rules a real ESP32 will face. Every reading is marked simulated.
// Usage (emulators running, after npm run seed): npm run simulate
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
    simulated: true,
    firmware: 'devtools-sim',
  };
  try {
    await setDoc(doc(db, `devices/${DEMO_DEVICE.id}/readings/${bootId}-${seq}`), reading);
    console.log(`#${seq} pH ${reading.ph ?? '—'}  ${reading.temperatureC ?? '—'} °C  NH3 gas ${reading.nh3GasMv ?? '—'} mV`);
    seq++;
  } catch (err) {
    console.error(`#${seq} rejected: ${err.code ?? err.message}`);
  }
}

await send();
setInterval(send, DEMO_DEVICE.readingIntervalSec * 1000);
