// Everything the page says, in one place. Claims must match what the project really does
// (CLAUDE.md): a prototype, ammonia measured as gas in the air, no drinking-water certification.

/**
 * The APK is hosted on GitHub Releases (too big for Vercel). Each release carries it as
 * TubigTala.apk, so this always gets the newest. The page links only to the file itself.
 */
export const APK_URL = 'https://github.com/magatnokia-design/tubigtala/releases/latest/download/TubigTala.apk';
export const APP_VERSION = '0.9.3';

export const steps = [
  { icon: 'sensors', title: 'The station measures', text: 'An ESP32 station at your tank reads the water temperature, the pH, and the ammonia gas in the air above the water - every minute.' },
  { icon: 'cloud_upload', title: 'It uploads securely', text: 'Each reading goes over Wi-Fi to the cloud (Firebase), signed in as your own station. Only you can see your data.' },
  { icon: 'smartphone', title: 'Your phone shows it', text: 'The TubigTala app shows live values in plain words - Normal, A bit high, Too high - with history and alerts.' },
];

export const features = [
  { icon: 'water_drop', title: 'Live readings', text: 'Temperature, pH and ammonia gas, refreshed every minute, coloured green, amber or red.' },
  // SMS rule as in functions/src/policy.ts: temperature, or pH once calibrated, critical for
  // SMS_STREAK (3) readings in a row. Both channels verified 16 Nov 2026 with the app closed
  // (push from the server via Firebase Cloud Messaging, app 0.9.2+).
  { icon: 'notifications_active', title: 'Alerts', text: 'A phone notification when a reading leaves its normal range, even when the app is closed, and an SMS when the temperature or the calibrated pH stays critical for three readings in a row.' },
  // Matches the app's Analytics cards since 0.9.3 (no high / low lines; one summary line).
  { icon: 'monitoring', title: 'Charts and insights', text: 'The last hour live, or any day or week since data started, with how much of the time each reading was normal and which way it moved.' },
  { icon: 'download', title: 'Excel export', text: 'Pick today, one day or a date range and save the readings as a spreadsheet.' },
  { icon: 'qr_code_scanner', title: 'Scan to pair', text: 'Add your station by scanning the QR sticker on it. No setup codes to type.' },
  { icon: 'water_ph', title: 'pH calibration', text: 'Calibrate the pH probe in the app with your buffer solutions (6.86 and 4.01), step by step.' },
];

/**
 * Real screenshots of the app (website/public/screens, 720 x 1536): the phone's status bar
 * cropped off, personal details blurred (Settings). Taken 16 Nov 2026 with app 0.9.2 - retake
 * Analytics with 0.9.3+ (no high / low lines since then).
 */
export const screens = [
  { src: '/screens/water.jpg', caption: 'Live readings in plain words', alt: 'TubigTala Water screen: pH 6.9, temperature 25.0 °C and ammonia gas 1619 mV, each marked Normal on a coloured scale' },
  { src: '/screens/analytics.jpg', caption: 'Charts for the last hour, any day or a week', alt: 'TubigTala Analytics screen: last-hour charts of pH, temperature and ammonia gas' },
  { src: '/screens/settings.jpg', caption: 'SMS and phone alerts, your station, pH calibration', alt: 'TubigTala Settings screen: SMS alerts, the TubigTala Station shown Live, pH calibration and phone notifications (personal details blurred)' },
] as const;

/**
 * Gauges use the app's own scale colours and normal ranges (mobile/src/domain/thresholds.ts):
 * the bar runs min..max, the bright window is the normal range.
 */
export const sensors = [
  {
    icon: 'device_thermostat', name: 'Temperature', part: 'DS18B20 waterproof probe', where: 'In the water',
    normal: '20 – 32 °C', min: 0, max: 40, lo: 20, hi: 32, ticks: ['0 °C', '40 °C'], gradient: ['scaleCool', 'scaleNeutral', 'scaleWarm'],
    note: 'Flags water that is unusually cold or warm.',
  },
  {
    icon: 'water_ph', name: 'pH level', part: 'PH-4502C board and glass probe', where: 'In the water',
    normal: '6.5 – 8.5', min: 0, max: 14, lo: 6.5, hi: 8.5, ticks: ['0 acidic', '14 basic'], gradient: ['scaleAcid', 'scaleNeutral', 'scaleBase'],
    note: 'Calibrated in the app with 6.86 and 4.01 buffer solutions.',
  },
  {
    icon: 'air', name: 'Ammonia gas', part: 'MQ-137 gas sensor', where: 'Above the water',
    normal: 'up to 1700 mV', min: 0, max: 3000, lo: 0, hi: 1700, ticks: ['0 mV', '3000 mV'], gradient: ['scaleNeutral', 'scaleWarm', 'levelCritical'],
    note: 'Gas in the air over the tank - a relative reading, not ppm.',
  },
] as const;

export const installSteps = [
  'Tap Download for Android on your phone. The file is TubigTala.apk (about 65 MB).',
  'Open it. If Android asks, allow your browser to "Install unknown apps".',
  'If Play Protect warns about an unknown app, choose to install anyway - TubigTala is not on the Play Store yet.',
  'Open TubigTala, create your account, and scan the QR sticker on your station.',
];

export const DISCLAIMER =
  'TubigTala is a student IoT prototype. It is not a certified drinking-water test and does not replace a laboratory test. Ammonia is measured as gas in the air above the water, as a relative value.';
