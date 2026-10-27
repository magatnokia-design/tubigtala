// Raises alerts from inside the app while it is open (the interim until Cloud Functions do it
// server-side). For each device and reading field it remembers the last status on this phone
// and raises one alert when the status gets worse (normal -> warning -> critical). Recovering
// or staying bad raises nothing, so a continuing problem does not repeat every minute.
import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { formatNumber } from '@/domain/format';
import { classify, isEscalation, METRIC_INFO, normalRangeText, type Level, type Metric } from '@/domain/thresholds';
import type { Device } from '@/domain/types';
import { useAuth } from '@/hooks/use-auth';
import { useLatestReading } from '@/hooks/use-devices';
import { useProfile } from '@/hooks/use-profile';
import { useSelectedDevice } from '@/hooks/use-selected-device';
import { createAlert, showPhoneNotification } from '@/services/notifications';

const METRICS: Metric[] = ['ph', 'temperatureC', 'nh3GasMv'];
const levelKey = (uid: string, deviceId: string, metric: Metric) => `tubigtala.level.v1.${uid}.${deviceId}.${metric}`;

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

  useEffect(() => {
    if (!uid || !reading) return;
    (async () => {
      for (const metric of METRICS) {
        const value = reading[metric];
        const status = classify(metric, value);
        if (status.level === 'unknown') continue; // a missing value says nothing about the water
        const key = levelKey(uid, device.id, metric);
        const previous = ((await AsyncStorage.getItem(key).catch(() => null)) ?? 'normal') as Level;
        await AsyncStorage.setItem(key, status.level).catch(() => undefined);
        if (!isEscalation(previous, status.level) || status.level === 'normal') continue;

        const info = METRIC_INFO[metric];
        const shown = `${formatNumber(value, info.decimals)}${info.unit ? ` ${info.unit}` : ''}`;
        const title = `${info.name}: ${status.label}`;
        const body = `${device.name}${device.simulated ? ' (simulated)' : ''} · ${shown} · normal ${normalRangeText(metric)}`;
        const created = await createAlert(uid, {
          deviceId: device.id, readingId: reading.id, metric, value, level: status.level as 'warning' | 'critical', title, body,
        }).catch(() => false);
        if (created && pushEnabled) await showPhoneNotification(title, body).catch(() => undefined);
      }
    })();
  }, [uid, device.id, device.name, device.simulated, reading, pushEnabled]);

  return null;
}
