// TubigTala firmware - step 1 skeleton (24 Oct 2026).
// Reads the DS18B20, pH and MQ-137 sensors, validates each value against
// docs/data-model.md and prints one JSON line per reading to serial (115200 baud).
// Wi-Fi, NTP and Firestore upload arrive in step 4 (see TODOs).
// Compiled only - never flashed or run on hardware yet.

#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>  // 6.21.5 only - shared with Dagitab, do not upgrade to 7
#include "config.h"

OneWire oneWire(PIN_DS18B20);
DallasTemperature ds18b20(&oneWire);

char bootId[9];  // random per boot; readingId = bootId-seq (duplicate-upload guard)
uint32_t seq = 0;
uint32_t lastReadingMs = 0;
bool firstReading = true;

// NAN means "no valid reading" and is sent as null, never as 0.

float readTemperatureC() {
  ds18b20.requestTemperatures();
  float t = ds18b20.getTempCByIndex(0);
  if (t == DEVICE_DISCONNECTED_C) return NAN;  // -127: probe missing
  if (t == 85.0f) return NAN;                  // power-on register value, not a measurement
  if (t < TEMP_MIN_C || t > TEMP_MAX_C) return NAN;
  return t;
}

// Averaged module output voltage in mV, undoing the divider.
float readModuleMv(uint8_t pin, float dividerRatio) {
  uint32_t sum = 0;
  for (int i = 0; i < ADC_SAMPLES; i++) {
    sum += analogReadMilliVolts(pin);
    delay(2);
  }
  float pinMv = (float)sum / ADC_SAMPLES;
  if (pinMv >= ADC_SATURATED_MV) return NAN;  // clipped - true value unknown
  float moduleMv = pinMv / dividerRatio;
  if (moduleMv < 0 || moduleMv > MODULE_MV_MAX) return NAN;
  return moduleMv;
}

// Two-point linear fit through the pH 7 and pH 4 buffer voltages.
float phFromMv(float mv) {
  if (isnan(mv)) return NAN;
  float slope = (7.0f - 4.0f) / (PH7_MV - PH4_MV);
  float ph = 7.0f + (mv - PH7_MV) * slope;
  if (ph < PH_MIN || ph > PH_MAX) return NAN;
  return ph;
}

void putOrNull(JsonDocument& doc, const char* key, float v, int decimals) {
  if (isnan(v)) doc[key] = serialized("null");
  else doc[key] = serialized(String(v, decimals));
}

void takeReading() {
  float temperatureC = readTemperatureC();
  float phMv = readModuleMv(PIN_PH, PH_DIVIDER_RATIO);
  float ph = phFromMv(phMv);
  float nh3GasMv = millis() < NH3_WARMUP_MS ? NAN : readModuleMv(PIN_NH3, NH3_DIVIDER_RATIO);

  StaticJsonDocument<384> doc;
  doc["bootId"] = bootId;
  doc["seq"] = seq;
  doc["deviceTime"] = serialized("null");  // TODO step 4: NTP time once synced
  putOrNull(doc, "ph", ph, 2);
  doc["phCalibrated"] = PH_CALIBRATED;
  putOrNull(doc, "phMv", phMv, 0);
  putOrNull(doc, "temperatureC", temperatureC, 2);
  putOrNull(doc, "nh3GasMv", nh3GasMv, 0);
  doc["simulated"] = false;
  doc["firmware"] = FIRMWARE_VERSION;

  Serial.print("READING ");
  serializeJson(doc, Serial);
  Serial.println();

  // TODO step 4: upload to devices/{deviceId}/readings/{bootId}-{seq} via the Firestore
  // REST commit API (precondition exists=false, serverTime = REQUEST_TIME transform).
  // Treat ALREADY_EXISTS as success; retry other failures with backoff.
  seq++;
}

void setup() {
  Serial.begin(115200);
  snprintf(bootId, sizeof(bootId), "%08lx", (unsigned long)esp_random());
  analogSetAttenuation(ADC_11db);
  ds18b20.begin();
  Serial.printf("TubigTala %s boot %s, DS18B20 count %d, pH %s\n", FIRMWARE_VERSION, bootId,
                ds18b20.getDeviceCount(), PH_CALIBRATED ? "calibrated" : "UNCALIBRATED");
  // TODO step 4: Wi-Fi connect, NTP sync, Firebase Auth sign-in as the device account.
}

void loop() {
  if (firstReading || millis() - lastReadingMs >= READING_INTERVAL_MS) {
    firstReading = false;
    lastReadingMs = millis();
    takeReading();
  }
}
