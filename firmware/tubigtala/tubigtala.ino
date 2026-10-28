// TubigTala firmware (27 Oct 2026).
// Reads the DS18B20, pH and MQ-137 sensors, validates each value against docs/data-model.md,
// prints one JSON line per reading to serial (115200 baud) and uploads it to Firestore
// (cloud.cpp) over Wi-Fi, queueing readings while offline.
// Compiled only - never flashed or run on hardware yet.

#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>  // 6.21.5 only - shared with Dagitab, do not upgrade to 7
#include <WiFi.h>
#include "config.h"
#include "cloud.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#warning "secrets.h missing: compiling with placeholders from secrets.example.h - uploads will fail"
#endif

OneWire oneWire(PIN_DS18B20);
DallasTemperature ds18b20(&oneWire);

char bootId[9];  // random per boot; readingId = bootId-seq (duplicate-upload guard)
uint32_t seq = 0;
uint32_t lastReadingMs = 0;
bool firstReading = true;
uint32_t lastWifiAttemptMs = 0;

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

// Two-point linear fit through the pH 7 and pH 4 buffer voltages - the same formula as
// mobile/src/domain/calibration.ts phFromMv(). Uses the app's calibration when there is one.
float phFromMv(float mv) {
  if (isnan(mv)) return NAN;
  const PhCalibration& cal = cloudCalibration();
  float slope = (7.0f - 4.0f) / (cal.ph7Mv - cal.ph4Mv);
  float ph = 7.0f + (mv - cal.ph7Mv) * slope;
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
  time_t now = time(nullptr);
  bool clockOk = now > VALID_EPOCH;
  if (clockOk) doc["deviceTime"] = (long)now;
  else doc["deviceTime"] = serialized("null");
  putOrNull(doc, "ph", ph, 2);
  doc["phCalibrated"] = cloudCalibration().calibrated;
  putOrNull(doc, "phMv", phMv, 0);
  putOrNull(doc, "temperatureC", temperatureC, 2);
  putOrNull(doc, "nh3GasMv", nh3GasMv, 0);
  doc["simulated"] = false;
  doc["firmware"] = FIRMWARE_VERSION;

  Serial.print("READING ");
  serializeJson(doc, Serial);
  Serial.println();

  cloudEnqueue(Reading{seq, clockOk ? now : 0, ph, cloudCalibration().calibrated, phMv, temperatureC, nh3GasMv});
  seq++;
}

void setup() {
  Serial.begin(115200);
  snprintf(bootId, sizeof(bootId), "%08lx", (unsigned long)esp_random());
  analogSetAttenuation(ADC_11db);
  ds18b20.begin();
  cloudBegin(bootId);  // loads the saved pH calibration from flash, so do it before printing it
  Serial.printf("TubigTala %s boot %s, DS18B20 count %d, pH %s\n", FIRMWARE_VERSION, bootId,
                ds18b20.getDeviceCount(), cloudCalibration().calibrated ? "calibrated" : "UNCALIBRATED");
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttemptMs = millis();
  configTzTime(TZ_INFO, NTP_SERVER_1, NTP_SERVER_2);  // syncs in the background once online
#ifdef FIREBASE_EMULATOR_HOST
  Serial.printf("Device %s, Wi-Fi \"%s\", uploading to EMULATOR at %s\n", DEVICE_ID, WIFI_SSID, FIREBASE_EMULATOR_HOST);
#else
  Serial.printf("Device %s, Wi-Fi \"%s\", uploading to %s\n", DEVICE_ID, WIFI_SSID, FIREBASE_PROJECT_ID);
#endif
}

void maintainWifi() {
  if (WiFi.status() == WL_CONNECTED || millis() - lastWifiAttemptMs < WIFI_RETRY_MS) return;
  lastWifiAttemptMs = millis();
  Serial.println("[wifi] not connected, retrying");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void loop() {
  if (firstReading || millis() - lastReadingMs >= READING_INTERVAL_MS) {
    firstReading = false;
    lastReadingMs = millis();
    takeReading();
  }
  maintainWifi();
  cloudLoop();
}
