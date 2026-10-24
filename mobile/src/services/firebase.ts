// The only place the app initialises Firebase. Screens never import firebase/* directly;
// they go through the service modules in this folder.
//
// Default mode is the local emulator (project demo-tubigtala, see docs/runbook.md).
// Set EXPO_PUBLIC_USE_EMULATOR=false plus the EXPO_PUBLIC_FIREBASE_* values to use the real
// project. Those values are public web config, not secrets - never put API keys for
// TextBee/Brevo or service accounts in EXPO_PUBLIC_ variables.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

export const usingEmulator = process.env.EXPO_PUBLIC_USE_EMULATOR !== 'false';

// On a phone, 127.0.0.1 is the phone itself. Use the PC's address that Expo Go loaded the app from.
export const emulatorHost =
  process.env.EXPO_PUBLIC_EMULATOR_HOST || Constants.expoConfig?.hostUri?.split(':')[0] || '127.0.0.1';

function options(): FirebaseOptions {
  if (usingEmulator) return { projectId: 'demo-tubigtala', apiKey: 'demo-key', appId: 'demo-app' };
  const o = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
  const missing = Object.entries(o).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Firebase config missing: ${missing.join(', ')} (see mobile/.env.example)`);
  return o;
}

const firstInit = getApps().length === 0;
const app = firstInit ? initializeApp(options()) : getApp();

// initializeAuth may only run once per app; fast refresh re-runs this module.
export const auth: Auth = firstInit
  ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
  : getAuth(app);
export const db = getFirestore(app);

if (usingEmulator && firstInit) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
}
