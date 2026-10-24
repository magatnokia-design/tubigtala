// Moves the simulated device to another (emulator) account, e.g. the test Google account,
// which otherwise starts with no devices. Devices have one owner (docs/data-model.md).
// Usage (emulators running; sign in once with that account first so it exists):
//   npm run assign -- demo.google@tubigtala.test
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { PROJECT_ID, AUTH_HOST, FIRESTORE_HOST, FIRESTORE_PORT, DEMO_DEVICE } from './emulator.mjs';

process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;

const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run assign -- <email>');
  process.exit(1);
}

initializeApp({ projectId: PROJECT_ID });
let user;
try {
  user = await getAuth().getUserByEmail(email);
} catch {
  console.error(`No emulator account for ${email}. Sign in with it in the app once, then re-run.`);
  process.exit(1);
}

await getFirestore().doc(`devices/${DEMO_DEVICE.id}`).update({ ownerUid: user.uid });
console.log(`Device ${DEMO_DEVICE.id} now belongs to ${email}. The app's device list updates by itself.`);
process.exit(0);
