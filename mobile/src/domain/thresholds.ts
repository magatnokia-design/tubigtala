// Alert ranges: the one place that decides whether a reading is normal, a warning or
// critical. The Water cards, alerts, Analytics insights and Excel export all use this, so
// they cannot disagree. When Cloud Functions send alerts, move this to shared code.
//
// PLACEHOLDER VALUES (27 Oct 2026): the water type (fishpond, aquarium, tank) has not been
// decided, so these are generic. Ammonia is an uncalibrated relative mV value; its ranges
// are guesses until the real sensor's baseline is measured (docs/wiring.md).

export type Metric = 'ph' | 'temperatureC' | 'nh3GasMv';
export type Level = 'normal' | 'warning' | 'critical' | 'unknown';

export interface Range {
  /** inclusive bounds of "normal" */
  normal: [number, number];
  /** inclusive bounds of "warning"; outside these is critical */
  warning: [number, number];
}

export const RANGES: Record<Metric, Range> = {
  ph: { normal: [6.5, 8.5], warning: [6.0, 9.0] },
  temperatureC: { normal: [20, 32], warning: [15, 35] },
  nh3GasMv: { normal: [0, 600], warning: [0, 900] },
};

export const METRIC_INFO: Record<Metric, { name: string; unit: string; decimals: number; low: [string, string]; high: [string, string] }> = {
  // [warning word, critical word]
  ph: { name: 'pH level', unit: '', decimals: 1, low: ['Slightly acidic', 'Too acidic'], high: ['Slightly basic', 'Too basic'] },
  temperatureC: { name: 'Temperature', unit: '°C', decimals: 1, low: ['Cool', 'Too cold'], high: ['Warm', 'Too hot'] },
  nh3GasMv: { name: 'Ammonia', unit: 'mV', decimals: 0, low: ['Low', 'Low'], high: ['Elevated', 'High'] },
};

export interface Status {
  level: Level;
  /** plain-language word shown on the card, e.g. "Normal", "Too hot" */
  label: string;
}

export function classify(metric: Metric, value: number | null): Status {
  if (value === null || !Number.isFinite(value)) return { level: 'unknown', label: 'No reading' };
  const { normal, warning } = RANGES[metric];
  const info = METRIC_INFO[metric];
  if (value >= normal[0] && value <= normal[1]) return { level: 'normal', label: 'Normal' };
  const low = value < normal[0];
  const inWarning = value >= warning[0] && value <= warning[1];
  const words = low ? info.low : info.high;
  return { level: inWarning ? 'warning' : 'critical', label: inWarning ? words[0] : words[1] };
}

const SEVERITY: Record<Level, number> = { unknown: 0, normal: 0, warning: 1, critical: 2 };

/** True when a reading got worse (normal -> warning, warning -> critical, normal -> critical). */
export function isEscalation(previous: Level, next: Level): boolean {
  return SEVERITY[next] > SEVERITY[previous];
}

/** "6.5 – 8.5" style text of the normal range, for alerts and exports. */
export function normalRangeText(metric: Metric): string {
  const { normal } = RANGES[metric];
  const { unit, decimals } = METRIC_INFO[metric];
  const lo = metric === 'nh3GasMv' ? 'up to' : `${normal[0].toFixed(decimals)} –`;
  return `${lo} ${normal[1].toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}
