import { useCallback } from 'react';

import type { Device, Reading } from '@/domain/types';
import { useAuth } from '@/hooks/use-auth';
import { useSubscription, type LoadState, type Subscribe } from '@/hooks/use-subscription';
import { subscribeLatestReading, subscribeOwnedDevices, subscribeReadingsSince } from '@/services/devices';

export type { LoadState };

export function useOwnedDevices(): LoadState<Device[]> {
  const uid = useAuth().user?.uid ?? null;
  const subscribe = useCallback<Subscribe<Device[]>>(
    (onData, onError) => subscribeOwnedDevices(uid ?? '', onData, onError),
    [uid],
  );
  return useSubscription(uid, subscribe);
}

export function useLatestReading(deviceId: string | null): LoadState<Reading | null> {
  const subscribe = useCallback<Subscribe<Reading | null>>(
    (onData, onError) => subscribeLatestReading(deviceId ?? '', onData, onError),
    [deviceId],
  );
  return useSubscription(deviceId, subscribe);
}

export function useReadingsSince(deviceId: string | null, windowMs: number): LoadState<{ readings: Reading[]; truncated: boolean }> {
  const subscribe = useCallback<Subscribe<{ readings: Reading[]; truncated: boolean }>>(
    (onData, onError) => subscribeReadingsSince(deviceId ?? '', Date.now() - windowMs, onData, onError),
    [deviceId, windowMs],
  );
  return useSubscription(deviceId === null ? null : `${deviceId}|${windowMs}`, subscribe);
}
