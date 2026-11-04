// App-side shapes of the Firestore documents in docs/data-model.md.
// Sensor values stay `number | null`: null means "no valid reading", never 0.

export type PhCalibrationStatus = 'uncalibrated' | 'calibrated';

/** devices/{id}.phCalibration - two-point buffer voltages the board applies. */
export interface PhCalibration {
  status: PhCalibrationStatus;
  calibratedAtMs: number | null;
  /** module output in the pH 7 / pH 4 buffers, mV; null unless calibrated */
  ph7Mv: number | null;
  ph4Mv: number | null;
}

export interface Device {
  id: string;
  name: string;
  simulated: boolean;
  readingIntervalSec: number;
  /** May be missing in data cached by an older app version - treat as uncalibrated. */
  phCalibration?: PhCalibration;
}

/** users/{uid} (docs/data-model.md). */
export interface Profile {
  displayName: string;
  /** +639XXXXXXXXX, or null until entered. */
  phoneE164: string | null;
  smsAlertsEnabled: boolean;
  pushEnabled: boolean;
}

/** users/{uid}/notifications/{id}: alerts (raised by the app while open, later by the backend). */
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  deviceId: string | null;
  metric: 'ph' | 'temperatureC' | 'nh3GasMv' | null;
  value: number | null;
  level: 'warning' | 'critical' | null;
  createdAtMs: number;
  read: boolean;
}

export interface Reading {
  id: string;
  /** Server receive time (ms). The clock all status logic uses. */
  serverTimeMs: number;
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
