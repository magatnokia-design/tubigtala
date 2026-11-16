// App-side shapes of the Firestore documents in docs/data-model.md.
// Sensor values stay `number | null`: null means "no valid reading", never 0.
import type { Limits } from './limits.ts';
import type { Range } from './thresholds.ts';

export type PhCalibrationStatus = 'uncalibrated' | 'calibrated';

/** devices/{id}.phCalibration - two-point buffer voltages the board applies. */
export interface PhCalibration {
  status: PhCalibrationStatus;
  calibratedAtMs: number | null;
  /** module output in the neutral (~7) / acid (~4) buffers, mV; null unless calibrated */
  ph7Mv: number | null;
  ph4Mv: number | null;
  /** true pH of those buffers, e.g. 6.86 / 4.01; 7.00 / 4.00 for calibrations saved before these existed */
  ph7BufferPh: number;
  ph4BufferPh: number;
}

export interface Device {
  id: string;
  name: string;
  simulated: boolean;
  readingIntervalSec: number;
  /** when this account paired the station (QR); null for stations assigned before pairing existed */
  pairedAtMs: number | null;
  /** May be missing in data cached by an older app version - treat as uncalibrated. */
  phCalibration?: PhCalibration;
  /**
   * Alert limits (devices/{id}.limits, limits.ts): the station's own, or the defaults. Missing in
   * data cached by app versions before 0.9.4 - read it with limitsOf(device), never directly.
   */
  limits?: Limits;
  /** true when the station has its own limits (not the defaults) */
  customLimits?: boolean;
  /** when the owner last saved them; null for the defaults */
  limitsUpdatedAtMs?: number | null;
}

/** users/{uid} (docs/data-model.md). */
export interface Profile {
  displayName: string;
  /** +639XXXXXXXXX, or null until entered. */
  phoneE164: string | null;
  smsAlertsEnabled: boolean;
  pushEnabled: boolean;
}

/** users/{uid}/notifications/{id}: alerts, raised by the backend (functions/src/readings.ts, stations.ts). */
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  deviceId: string | null;
  metric: 'ph' | 'temperatureC' | 'nh3GasMv' | null;
  value: number | null;
  level: 'warning' | 'critical' | null;
  /**
   * The limits this alert was checked against (the station's at that time), so its status words and
   * normal range stay as they were when the limits change. null = the defaults (alerts before 0.9.4).
   */
  limits: Range | null;
  /**
   * Station health alerts from the backend (docs/data-model.md): a sensor without values,
   * the station offline, or back online. null = an alert about a reading's value.
   */
  kind: 'sensor' | 'offline' | 'online' | null;
  createdAtMs: number;
  read: boolean;
}

export interface Reading {
  id: string;
  /** Server receive time (ms). The clock all status logic uses. */
  serverTimeMs: number;
  /**
   * Readings since the station powered on (0 = the first after power-on; domain/warmup.ts).
   * null when missing - also in readings cached by app versions before 0.9.5.
   */
  seq: number | null;
  /** ESP32 NTP time (ms), display only; null if the device clock was not synced. */
  deviceTimeMs: number | null;
  /** pH, 0-14 */
  ph: number | null;
  phCalibrated: boolean;
  /** pH module output, mV */
  phMv: number | null;
  /** Water temperature, °C */
  temperatureC: number | null;
  /** MQ-137 output, mV. Ammonia gas in air, uncalibrated, relative only - not ppm. */
  nh3GasMv: number | null;
  simulated: boolean;
  firmware: string;
}
