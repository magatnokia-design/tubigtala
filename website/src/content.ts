// Everything the page says, in one place. Claims must match what the project really does
// (CLAUDE.md): a prototype, ammonia measured as gas in the air, no drinking-water certification.

export const REPO_URL = 'https://github.com/magatnokia-design/tubigtala';
/** Stable name: each GitHub Release also carries the APK as TubigTala.apk, so this always gets the newest. */
export const APK_URL = `${REPO_URL}/releases/latest/download/TubigTala.apk`;
export const RELEASES_URL = `${REPO_URL}/releases`;
export const APP_VERSION = '0.8.0';

export const steps = [
  { icon: 'sensors', title: 'The station measures', text: 'An ESP32 station at your tank reads the water temperature, the pH, and the ammonia gas in the air above the water - every minute.' },
  { icon: 'cloud_upload', title: 'It uploads securely', text: 'Each reading goes over Wi-Fi to the cloud (Firebase), signed in as your own station. Only you can see your data.' },
  { icon: 'smartphone', title: 'Your phone shows it', text: 'The TubigTala app shows live values in plain words - Normal, A bit high, Too high - with history and alerts.' },
];

export const features = [
  { icon: 'water_drop', title: 'Live readings', text: 'Temperature, pH and ammonia gas, refreshed every minute, coloured green, amber or red.' },
  // SMS needs the server backend (Blaze), not live yet - say so until it is (CLAUDE.md: no unbuilt claims).
  { icon: 'notifications_active', title: 'Alerts', text: 'A phone notification when a reading leaves its normal range. SMS alerts for critical pH or temperature are coming soon.' },
  { icon: 'monitoring', title: 'Charts and insights', text: 'The last hour live, or any day or week since data started, with highs, lows and trends.' },
  { icon: 'download', title: 'Excel export', text: 'Pick today, one day or a date range and save the readings as a spreadsheet.' },
  { icon: 'qr_code_scanner', title: 'Scan to pair', text: 'Add your station by scanning the QR sticker on it. No setup codes to type.' },
  { icon: 'water_ph', title: 'pH calibration', text: 'Calibrate the pH probe in the app with your buffer solutions (6.86 and 4.01), step by step.' },
];

export const sensors = [
  { icon: 'device_thermostat', name: 'Temperature', part: 'DS18B20 waterproof probe', normal: 'Normal 20 to 32 °C', note: 'In the water.' },
  { icon: 'water_ph', name: 'pH level', part: 'PH-4502C board and glass probe', normal: 'Normal 6.5 to 8.5', note: 'In the water. Calibrated with buffer solutions.' },
  { icon: 'air', name: 'Ammonia gas', part: 'MQ-137 gas sensor', normal: 'Normal up to 1700 mV', note: 'In the air above the water: a relative reading, not ppm.' },
];

export const installSteps = [
  'Tap Download for Android on your phone. The file is TubigTala.apk.',
  'Open it. If Android asks, allow your browser to "Install unknown apps".',
  'If Play Protect warns about an unknown app, choose to install anyway - TubigTala is not on the Play Store yet.',
  'Open TubigTala, create your account, and scan the QR sticker on your station.',
];

export const DISCLAIMER =
  'TubigTala is a student IoT prototype. It is not a certified drinking-water test and does not replace a laboratory test. Ammonia is measured as gas in the air above the water, as a relative value.';
