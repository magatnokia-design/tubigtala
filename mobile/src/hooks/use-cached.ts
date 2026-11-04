import { useEffect, useState } from 'react';

import type { LoadState } from '@/hooks/use-subscription';
import { readCache, writeCache } from '@/services/offline-cache';

/**
 * Wraps a live load state with the last value saved on this phone: live data wins and is
 * saved; while live data is loading or unreachable (offline), the saved value is shown.
 * `key` null = nothing to cache (e.g. signed out).
 */
export function useCached<T>(key: string | null, live: LoadState<T>): LoadState<T> {
  const [saved, setSaved] = useState<{ key: string; data: T } | null>(null);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    readCache<T>(key).then((data) => {
      if (alive && data !== null) setSaved((s) => (s?.key === key ? s : { key, data }));
    });
    return () => { alive = false; };
  }, [key]);

  useEffect(() => {
    if (key && live.status === 'ready') writeCache(key, live.data);
  }, [key, live]);

  if (live.status === 'ready' || !key) return live;
  // Only stand in for "not here yet" or "cannot reach the database" - never for a permission error.
  if (live.status === 'error' && live.reason !== 'unavailable') return live;
  if (saved && saved.key === key) return { status: 'ready', data: saved.data };
  return live;
}
