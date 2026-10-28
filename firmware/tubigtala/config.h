#pragma once
// Non-secret settings. Pins and divider ratios marked (unverified) are the plan in
// docs/wiring.md, not measurements - update both when the hardware is checked.

#define FIRMWARE_VERSION "0.2.0"

// Pins (ADC1 only - ADC2 is unusable while Wi-Fi is on)
#define PIN_DS18B20 4   // (unverified) 4.7k pull-up to 3.3 V
#define PIN_PH 34       // (unverified) via divider
#define PIN_NH3 35      // (unverified) via divider

// Must match devices/{deviceId}.readingIntervalSec (docs/data-model.md)
#define READING_INTERVAL_MS 60000UL

// ADC
#define ADC_SAMPLES 16
#define ADC_SATURATED_MV 3100  // at 11 dB attenuation the ESP32 ADC clips above ~3.1 V

// Divider ratio = bottom / (top + bottom). Firmware divides by this to report module output.
#define PH_DIVIDER_RATIO 0.6f   // (unverified) 10k top / 15k bottom
#define NH3_DIVIDER_RATIO 0.6f  // (unverified) 10k top / 15k bottom

// pH: nominal PH-4502C voltages, used until a calibration is saved in the app (Settings >
// Device > Calibrate pH). Readings are flagged phCalibrated=false while these are in use.
#define PH7_MV 2500.0f  // nominal, not measured
#define PH4_MV 3040.0f  // nominal, not measured

// MQ-137 heater warm-up after power-on; nh3GasMv is null until it passes
#define NH3_WARMUP_MS 180000UL

// Plausible ranges (docs/data-model.md). Outside these a value is stored as null.
#define PH_MIN 0.0f
#define PH_MAX 14.0f
#define TEMP_MIN_C -10.0f
#define TEMP_MAX_C 60.0f
#define MODULE_MV_MAX 5500.0f

// ---- Cloud upload (cloud.cpp) ----
#define FIREBASE_PROJECT_ID "tubigtala-64d9e"  // never Dagitab's project
#define WIFI_RETRY_MS 10000UL
// Clock (deviceTime is display-only; serverTime is what the app trusts)
#define NTP_SERVER_1 "time.google.com"
#define NTP_SERVER_2 "pool.ntp.org"
#define TZ_INFO "<+08>-8"  // Philippines, UTC+8, no daylight saving
#define VALID_EPOCH 1700000000L  // earlier than this = clock not synced yet
// Readings kept while offline: 60 = one hour at one per minute; oldest dropped when full.
#define UPLOAD_QUEUE_SIZE 60
#define HTTP_TIMEOUT_MS 15000
#define UPLOAD_BACKOFF_MIN_MS 5000UL
#define UPLOAD_BACKOFF_MAX_MS 300000UL
// A reading the rules keep rejecting is dropped after this many tries.
#define MAX_REJECTED_TRIES 5
// How often to check the device record for a new pH calibration saved in the app.
#define CALIBRATION_REFRESH_MS 600000UL
