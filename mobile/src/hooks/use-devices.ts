import { useCallback } from 'react';

import type { Device, Reading } from '@/domain/types';
import { useAuth } from '@/hooks/use-auth';
import { useCached } from '@/hooks/use-cached';
import { useSubscription, type LoadState, type Subscribe } from '@/hooks/use-subscription';
import { subscribeLatestReading, subscribeOwnedDevices, subscribeReadingsBetween, subscribeReadingsSince } from '@/services/devices';

export type { LoadState };

export function useOwnedDevices(): LoadState<Device[]> {
  const uid = useAuth().user?.uid ?? null;
  const subscribe = useCallback<Subscribe<Device[]>>(
    (onData, onError) => subscribeOwnedDevices(uid ?? '', onData, onError),
    [uid],
  );
  return useCached(uid && `devices.${uid}`, useSubscription(uid, subscribe));
}

export function useLatestReading(deviceId: string | null): LoadState<Reading | null> {
  const subscribe = useCallback<Subscribe<Reading | null>>(
    (onData, onError) => subscribeLatestReading(deviceId ?? '', onData, onError),
    [deviceId],
  );
  return useCached(deviceId && `latest.${deviceId}`, useSubscription(deviceId, subscribe));
}

export function useReadingsSince(deviceId: string | null, windowMs: number): LoadState<{ readings: Reading[]; truncated: boolean }> {
  const subscribe = useCallback<Subscribe<{ readings: Reading[]; truncated: boolean }>>(
    (onData, onError) => subscribeReadingsSince(deviceId ?? '', Date.now() - windowMs, onData, onError),
    [deviceId, windowMs],
  );
  return useSubscription(deviceId === null ? null : `${deviceId}|${windowMs}`, subscribe);
}

/** Readings between two times, live. */
export function useReadingsBetween(deviceId: string | null, startMs: number, endMs: number): LoadState<{ readings: Reading[]; truncated: boolean }> {
  const subscribe = useCallback<Subscribe<{ readings: Reading[]; truncated: boolean }>>(
    (onData, onError) => subscribeReadingsBetween(deviceId ?? '', startMs, endMs, onData, onError),
    [deviceId, startMs, endMs],
  );
  return useSubscription(deviceId === null ? null : `${deviceId}|${startMs}|${endMs}`, subscribe);
}
