// On React Native, Firestore's cache lives in memory only (offline-cache.ts keeps our own copy).
// When the app starts without internet, a query that never reached the server is answered from
// that empty memory: zero documents, marked fromCache. That means "unknown", not "none" - shown
// as-is it would say "No device" / "No readings yet" / "No notifications" for an account that has
// them. Reporting it as `unavailable` lets useCached show the copy saved on the phone, or the
// screen show its offline message when nothing was saved.
import type { FirestoreError, QuerySnapshot } from 'firebase/firestore';

export function emptyBecauseOffline(snap: QuerySnapshot): FirestoreError | null {
  if (!snap.empty || !snap.metadata.fromCache) return null;
  // FirestoreError's constructor is private; the app only reads `code` and `message`
  // (hooks/use-subscription.ts toError), so an object of that shape is enough.
  return { name: 'FirebaseError', code: 'unavailable', message: 'Offline, and this was not loaded before' } as FirestoreError;
}
