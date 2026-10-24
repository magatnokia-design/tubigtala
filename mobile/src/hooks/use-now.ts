import { useEffect, useState } from 'react';

/** Current time, re-rendering every `everyMs` so "x min ago" and live/stale/offline stay current. */
export function useNow(everyMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
