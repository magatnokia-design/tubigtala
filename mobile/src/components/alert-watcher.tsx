// Raises alerts from inside the app while it is open (the interim until Cloud Functions do it
// server-side). The decision and the shared state live in services/alerts.ts; this only
// watches each device's latest reading and asks when a field's status changes.
import { useEffect, useRef } from 'react';

import { classify, type Level, type Metric } from '@/domain/thresholds';
import type { Device } from '@/domain/types';
import { useAuth } from '@/hooks/use-auth';
import { useLatestReading } from '@/hooks/use-devices';
import { useProfile } from '@/hooks/use-profile';
import { useSelectedDevice } from '@/hooks/use-selected-device';
import { evaluateAlert } from '@/services/alerts';
import { showPhoneNotification } from '@/services/notifications';

const METRICS: Metric[] = ['ph', 'temperatureC', 'nh3GasMv'];

/** Renders nothing; watches every device on the account. */
export function AlertWatchers() {
  const { devices } = useSelectedDevice();
  if (devices.status !== 'ready') return null;
  return devices.data.map((d) => <DeviceAlertWatcher key={d.id} device={d} />);
}

function DeviceAlertWatcher({ device }: { device: Device }) {
  const uid = useAuth().user?.uid ?? null;
  const profile = useProfile();
  const pushEnabled = profile.status === 'ready' && profile.data?.pushEnabled === true;
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
          const raised = await evaluateAlert(uid, device, reading, metric, status);
          confirmed.current[metric] = status.level;
          if (raised && pushEnabled) await showPhoneNotification(raised.title, raised.body).catch(() => undefined);
        } catch {
          delete confirmed.current[metric]; // offline or denied: try again with the next reading
        }
      }
    })();
  }, [uid, device, reading, pushEnabled]);

  return null;
}
