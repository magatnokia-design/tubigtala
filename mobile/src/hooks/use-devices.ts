// Live Firestore subscriptions as explicit load states, so screens can tell
// "no data" apart from "still loading", "permission denied" and "failed".
import { useCallback, useEffect, useState } from 'react';
import type { FirestoreError, Unsubscribe } from 'firebase/firestore';

import type { Device, Reading } from '@/domain/types';
import { useAuth } from '@/hooks/use-auth';
import { subscribeLatestReading, subscribeOwnedDevices, subscribeReadingsSince } from '@/services/devices';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; reason: 'permission-denied' | 'unavailable' | 'other'; message: string };

function toError(e: FirestoreError): LoadState<never> {
  if (e.code === 'permission-denied') {
    return { status: 'error', reason: 'permission-denied', message: 'You do not have access to this data.' };
  }
  if (e.code === 'unavailable') {
    return { status: 'error', reason: 'unavailable', message: 'Cannot reach the database. Check your connection.' };
  }
  return { status: 'error', reason: 'other', message: `Could not load data (${e.code}).` };
}

type Subscribe<T> = (onData: (data: T) => void, onError: (e: FirestoreError) => void) => Unsubscribe;

/**
 * Results are tagged with the subscription `key`, so after the key changes (another device,
 * another time range) the hook reports loading instead of the previous key's data.
 */
function useSubscription<T>(key: string | null, subscribe: Subscribe<T>): LoadState<T> {
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

export function useOwnedDevices(): LoadState<Device[]> {
  const uid = useAuth().user?.uid ?? null;
  const subscribe = useCallback<Subscribe<Device[]>>(
    (onData, onError) => subscribeOwnedDevices(uid ?? '', onData, onError),
    [uid],
  );
  return useSubscription(uid, subscribe);
}

export function useLatestReading(deviceId: string): LoadState<Reading | null> {
  const subscribe = useCallback<Subscribe<Reading | null>>(
    (onData, onError) => subscribeLatestReading(deviceId, onData, onError),
    [deviceId],
  );
  return useSubscription(deviceId, subscribe);
}

export function useReadingsSince(deviceId: string, windowMs: number): LoadState<Reading[]> {
  const subscribe = useCallback<Subscribe<Reading[]>>(
    (onData, onError) => subscribeReadingsSince(deviceId, Date.now() - windowMs, onData, onError),
    [deviceId, windowMs],
  );
  return useSubscription(`${deviceId}|${windowMs}`, subscribe);
}
