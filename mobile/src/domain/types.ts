// App-side shapes of the Firestore documents in docs/data-model.md.
// Sensor values stay `number | null`: null means "no valid reading", never 0.

export type PhCalibrationStatus = 'uncalibrated' | 'calibrated';

export interface Device {
  id: string;
  name: string;
  simulated: boolean;
  readingIntervalSec: number;
  phCalibrationStatus: PhCalibrationStatus;
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
