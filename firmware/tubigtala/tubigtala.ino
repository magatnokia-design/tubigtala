// TubigTala firmware (27 Oct 2026).
// Reads the DS18B20, pH and MQ-137 sensors, validates each value against docs/data-model.md,
// prints one JSON line per reading to serial (115200 baud) and uploads it to Firestore
// (cloud.cpp) over Wi-Fi, queueing readings while offline. Serial commands (help, diag, read,
// pins) help with wiring and bring-up.
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

// Averaged voltage at the ESP32 pin in mV (after the divider), not validated.
float readPinMv(uint8_t pin) {
  uint32_t sum = 0;
  for (int i = 0; i < ADC_SAMPLES; i++) {
    sum += analogReadMilliVolts(pin);
    delay(2);
  }
  return (float)sum / ADC_SAMPLES;
}

// Averaged module output voltage in mV, undoing the divider.
float readModuleMv(uint8_t pin, float dividerRatio) {
  float pinMv = readPinMv(pin);
  if (pinMv >= ADC_SATURATED_MV) return NAN;  // clipped - true value unknown
  float moduleMv = pinMv / dividerRatio;
  if (moduleMv < 0 || moduleMv > MODULE_MV_MAX) return NAN;
  return moduleMv;
}

// Two-point linear fit through (ph7Mv, ph7Buffer) and (ph4Mv, ph4Buffer), using the buffers'
// true pH (e.g. 6.86 / 4.01) - the same formula as mobile/src/domain/calibration.ts phFromMv().
// Uses the app's calibration when there is one.
float phFromMv(float mv) {
  if (isnan(mv)) return NAN;
  const PhCalibration& cal = cloudCalibration();
  float slope = (cal.ph7Buffer - cal.ph4Buffer) / (cal.ph7Mv - cal.ph4Mv);
  float ph = cal.ph7Buffer + (mv - cal.ph7Mv) * slope;
  if (ph < PH_MIN || ph > PH_MAX) return NAN;
  return ph;
}

void putOrNull(JsonDocument& doc, const char* key, float v, int decimals) {
  if (isnan(v)) doc[key] = serialized("null");
  else doc[key] = serialized(String(v, decimals));
}

void takeReading() {
  float temperatureC = readTemperatureC();
  float phMv = PH_ENABLED ? readModuleMv(PIN_PH, PH_DIVIDER_RATIO) : NAN;  // null while no board is fitted
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
  Serial.println("Type help for commands");
}

// ---- Serial commands (Serial Monitor at 115200 baud, line ending "Newline") ----
// For wiring and bring-up without re-flashing (CLAUDE.md); usage in docs/device-setup.md.
// They only read and print, except `read`, which takes a normal reading early.
char cmdBuf[16];
uint8_t cmdLen = 0;
uint32_t pinsUntilMs = 0;  // 0 = `pins` not running
uint32_t lastPinsMs = 0;

// "pin 1502 mV -> board 2503 mV", or CLIPPED when the pin is at the top of the ADC range.
void printPin(uint8_t pin, float dividerRatio) {
  float pinMv = readPinMv(pin);
  Serial.printf("pin %4.0f mV", pinMv);
  if (pinMv >= ADC_SATURATED_MV) Serial.print(" CLIPPED - pin near 3.3 V, check the divider");
  else Serial.printf(" -> board %4.0f mV", pinMv / dividerRatio);
}

void printDiag() {
  Serial.printf("--- diag: TubigTala %s, boot %s, up %lu s\n", FIRMWARE_VERSION, bootId, (unsigned long)(millis() / 1000));
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("Wi-Fi:  connected to \"%s\", signal %d dBm, IP %s\n", WIFI_SSID, WiFi.RSSI(), WiFi.localIP().toString().c_str());
  } else {
    Serial.printf("Wi-Fi:  NOT connected to \"%s\" (status %d)\n", WIFI_SSID, (int)WiFi.status());
  }
  time_t now = time(nullptr);
  if (now > VALID_EPOCH) {
    struct tm local;
    localtime_r(&now, &local);
    char when[20];
    strftime(when, sizeof(when), "%Y-%m-%d %H:%M:%S", &local);
    Serial.printf("Clock:  %s (UTC+8)\n", when);
  } else {
    Serial.println("Clock:  not synced yet (needs internet)");
  }
  Serial.printf("Queue:  %u reading(s) waiting to upload\n", (unsigned)cloudPending());
  const PhCalibration& cal = cloudCalibration();
  Serial.printf("pH cal: %s (pH %.2f = %.0f mV, pH %.2f = %.0f mV)\n", cal.calibrated ? "from the app" : "NOMINAL - not calibrated",
                cal.ph7Buffer, cal.ph7Mv, cal.ph4Buffer, cal.ph4Mv);

  ds18b20.begin();  // search the bus again, so a probe connected after boot is found
  int count = ds18b20.getDeviceCount();
  if (count == 0) {
    Serial.println("Temp:   DS18B20 NOT FOUND - check DAT->G4, VCC->3V3, GND, and the probe wires in the screw terminal");
  } else {
    ds18b20.requestTemperatures();
    float t = ds18b20.getTempCByIndex(0);
    if (t == DEVICE_DISCONNECTED_C) Serial.println("Temp:   DS18B20 found but not answering - check the DAT wire");
    else if (t == 85.0f) Serial.println("Temp:   85.00 C is the power-on value, not a measurement - run diag again");
    else Serial.printf("Temp:   %.2f C (%d probe(s) found)\n", t, count);
  }

  Serial.print("pH:     G34 ");
  printPin(PIN_PH, PH_DIVIDER_RATIO);
  if (!PH_ENABLED) {
    Serial.print(" - pH DISABLED (PH_ENABLED 0): uploads no reading");
  } else {
    float ph = phFromMv(readModuleMv(PIN_PH, PH_DIVIDER_RATIO));
    if (!isnan(ph)) Serial.printf(" -> pH %.2f%s", ph, cal.calibrated ? "" : " (uncalibrated)");
  }
  Serial.println();

  Serial.print("Gas:    G35 ");
  printPin(PIN_NH3, NH3_DIVIDER_RATIO);
  if (millis() < NH3_WARMUP_MS) Serial.printf(" (heater warming up, %lu s left)", (unsigned long)((NH3_WARMUP_MS - millis()) / 1000));
  Serial.println();
  Serial.println("---");
}

void handleCommand(const char* cmd) {
  if (strcmp(cmd, "help") == 0) {
    Serial.println("Commands: diag (status of Wi-Fi, clock, sensors), read (take a reading now),");
    Serial.println("          pins (G34/G35 voltage every second for 30 s), stop (end pins)");
  } else if (strcmp(cmd, "diag") == 0) {
    printDiag();
  } else if (strcmp(cmd, "read") == 0) {
    Serial.println("[cmd] taking a reading now");
    lastReadingMs = millis();
    takeReading();
  } else if (strcmp(cmd, "pins") == 0) {
    Serial.println("[pins] G34 (pH) and G35 (gas) every second for 30 s - type stop to end");
    pinsUntilMs = millis() + 30000UL;
    lastPinsMs = 0;
  } else if (strcmp(cmd, "stop") == 0) {
    if (pinsUntilMs) Serial.println("[pins] stopped");
    pinsUntilMs = 0;
  } else {
    Serial.printf("Unknown command \"%s\" - type help\n", cmd);
  }
}

// Reads typed characters without blocking, so readings and uploads carry on.
void pollSerial() {
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n' || ch == '\r') {
      if (cmdLen) {
        cmdBuf[cmdLen] = '\0';
        handleCommand(cmdBuf);
        cmdLen = 0;
      }
    } else if (ch != ' ' && cmdLen < sizeof(cmdBuf) - 1) {
      cmdBuf[cmdLen++] = tolower(ch);
    }
  }
  if (!pinsUntilMs) return;
  if ((int32_t)(millis() - pinsUntilMs) >= 0) {
    pinsUntilMs = 0;
    Serial.println("[pins] done");
  } else if (millis() - lastPinsMs >= 1000) {
    lastPinsMs = millis();
    Serial.print("G34 pH ");
    printPin(PIN_PH, PH_DIVIDER_RATIO);
    if (!PH_ENABLED) Serial.print(" (not uploaded)");
    Serial.print(" | G35 gas ");
    printPin(PIN_NH3, NH3_DIVIDER_RATIO);
    Serial.println();
  }
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
  pollSerial();
  maintainWifi();
  cloudLoop();
}
