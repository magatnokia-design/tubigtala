// Alert ranges: the one place that decides whether a reading is normal, a warning or
// critical. The Water cards, alerts, Analytics insights and Excel export all use this, so
// they cannot disagree. When Cloud Functions send alerts, move this to shared code.
//
// Water type: fresh / tap water (decided 4 Nov 2026). pH 6.5-8.5 is the usual drinking-water
// guideline range; temperature has no safety limit, so its range only flags unusual water.
// Ammonia gas is an uncalibrated relative mV value; its ranges are PLACEHOLDERS until the
// real sensor's baseline is measured (docs/wiring.md).
//
// Status words are plain on purpose ("too high", not "too basic"): they appear on the cards
// and in alert titles, and a user should understand them without chemistry terms.

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
  ph: { name: 'pH level', unit: '', decimals: 1, low: ['A bit low', 'Too low'], high: ['A bit high', 'Too high'] },
  temperatureC: { name: 'Temperature', unit: '°C', decimals: 1, low: ['A bit cold', 'Too cold'], high: ['A bit warm', 'Too hot'] },
  nh3GasMv: { name: 'Ammonia gas', unit: 'mV', decimals: 0, low: ['Low', 'Low'], high: ['A bit high', 'Too high'] },
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

/** "6.5 to 8.5" / "20 to 32 °C" / "up to 600 mV": the normal range in words, for alerts, the alert details and exports. */
export function normalRangeText(metric: Metric): string {
  const { normal } = RANGES[metric];
  const { unit, decimals } = METRIC_INFO[metric];
  const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(decimals));
  const lo = metric === 'nh3GasMv' ? 'up to' : `${n(normal[0])} to`;
  return `${lo} ${n(normal[1])}${unit ? ` ${unit}` : ''}`;
}
