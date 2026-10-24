#pragma once
// Non-secret settings. Pins and divider ratios marked (unverified) are the plan in
// docs/wiring.md, not measurements - update both when the hardware is checked.

#define FIRMWARE_VERSION "0.1.0-skeleton"

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

// pH two-point calibration (docs/wiring.md). Until PH_CALIBRATED is true, readings are
// sent with phCalibrated=false and the nominal PH-4502C values below.
#define PH_CALIBRATED false
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
