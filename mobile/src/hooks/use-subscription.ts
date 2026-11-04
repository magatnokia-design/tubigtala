// Live Firestore subscriptions as explicit load states, so screens can tell
// "no data" apart from "still loading", "permission denied" and "failed".
import { useEffect, useState } from 'react';
import type { FirestoreError, Unsubscribe } from 'firebase/firestore';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; reason: 'permission-denied' | 'unavailable' | 'other'; message: string };

export type Subscribe<T> = (onData: (data: T) => void, onError: (e: FirestoreError) => void) => Unsubscribe;

function toError(e: FirestoreError): LoadState<never> {
  if (e.code === 'permission-denied') {
    return { status: 'error', reason: 'permission-denied', message: 'You do not have access to this data.' };
  }
  if (e.code === 'unavailable') {
    return { status: 'error', reason: 'unavailable', message: 'Cannot reach the database. Check your connection.' };
  }
  return { status: 'error', reason: 'other', message: `Could not load data (${e.code}).` };
}

/**
 * Results are tagged with the subscription `key`, so after the key changes (another device,
 * another time range, another user) the hook reports loading instead of the previous key's data.
 * Pass a `subscribe` memoised on the same inputs as `key`; `key === null` means "not yet".
 */
export function useSubscription<T>(key: string | null, subscribe: Subscribe<T>): LoadState<T> {
  const [result, setResult] = useState<{ key: string; state: LoadState<T> } | null>(null);
  useEffect(() => {
    if (key === null) return;
    return subscribe(
      (data) => setResult({ key, state: { status: 'ready', data } }),
      (e) => setResult({ key, state: toError(e) }),
    );
  }, [key, subscribe]);
  return result !== null && result.key === key ? result.state : { status: 'loading' };
}
