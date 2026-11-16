// Raises alerts from inside the app while it is open. Since 16 Nov 2026 the backend
// (functions/src/readings.ts) raises them too, with the same shared state and alert ID, so
// whichever runs first creates the alert and the other sees it. The phone pop-up now comes only
// from the backend's push (services/notifications.ts), so an open app does not show it twice.
// The decision and the shared state live in services/alerts.ts; this only watches each device's
// latest reading and asks when a field's status changes.
import { useEffect, useRef } from 'react';

import { classify, type Level, type Metric } from '@/domain/thresholds';
import type { Device } from '@/domain/types';
import { useAuth } from '@/hooks/use-auth';
import { useLatestReading } from '@/hooks/use-devices';
import { useSelectedDevice } from '@/hooks/use-selected-device';
import { evaluateAlert } from '@/services/alerts';

const METRICS: Metric[] = ['ph', 'temperatureC', 'nh3GasMv'];

/** Renders nothing; watches every device on the account. */
export function AlertWatchers() {
  const { devices } = useSelectedDevice();
  if (devices.status !== 'ready') return null;
  return devices.data.map((d) => <DeviceAlertWatcher key={d.id} device={d} />);
}

function DeviceAlertWatcher({ device }: { device: Device }) {
  const uid = useAuth().user?.uid ?? null;
  const latest = useLatestReading(device.id);
  const reading = latest.status === 'ready' ? latest.data : null;
  // Last status this phone confirmed with the shared state. Lets an unchanged status skip the
  // Firestore transaction (and its read) on every reading; cleared on failure to retry.
  const confirmed = useRef<Partial<Record<Metric, Level>>>({});

  useEffect(() => {
    if (!uid || !reading) return;
    (async () => {
      for (const metric of METRICS) {
        const status = classify(metric, reading[metric]);
        if (status.level === 'unknown' || confirmed.current[metric] === status.level) continue;
        try {
          await evaluateAlert(uid, device, reading, metric, status);
          confirmed.current[metric] = status.level;
        } catch {
          delete confirmed.current[metric]; // offline or denied: try again with the next reading
        }
      }
    })();
  }, [uid, device, reading]);

  return null;
}
