// Shared settings for the local tools. The demo- prefix tells the Firebase SDKs this is an
// emulator-only project: requests can never reach a real project (tubigtala-64d9e or Dagitab's).
export const PROJECT_ID = 'demo-tubigtala';
export const AUTH_HOST = '127.0.0.1:9099';
export const FIRESTORE_HOST = '127.0.0.1';
export const FIRESTORE_PORT = 8080;

// Emulator-only demo accounts (not real credentials).
export const DEMO_OWNER = { email: 'demo@tubigtala.test', password: 'demo-pass-123' };
export const DEMO_DEVICE = {
  id: 'sim-01',
  email: 'device-sim-01@tubigtala.test',
  password: 'device-pass-123',
  readingIntervalSec: 10,
};
