// One icon per reading, used by the Water cards, Analytics charts and notifications, so the same
// reading always looks the same everywhere.
import type { AndroidSymbol } from 'expo-symbols';

import type { Metric } from '@/domain/thresholds';

export const METRIC_ICON: Record<Metric, AndroidSymbol> = {
  ph: 'water_ph',
  temperatureC: 'device_thermostat',
  nh3GasMv: 'air',
};
