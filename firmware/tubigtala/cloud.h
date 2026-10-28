#pragma once
// Sends readings to Firestore (devices/{DEVICE_ID}/readings/{bootId}-{seq}, docs/data-model.md).
// Readings wait in a small queue while Wi-Fi or Firebase is unreachable and are sent oldest
// first. Re-sending a reading targets the same document ID, which the rules only allow to be
// created once, so retries can never duplicate a reading.
#include <Arduino.h>
#include <time.h>

struct Reading {
  uint32_t seq;
  time_t deviceTime;  // 0 = clock not synced -> stored as null
  float ph;           // NAN = no valid reading -> stored as null (never 0)
  bool phCalibrated;
  float phMv;
  float temperatureC;
  float nh3GasMv;
};

/** pH two-point calibration: the probe voltages in pH 7 and pH 4 buffers (module output, mV). */
struct PhCalibration {
  bool calibrated;
  float ph7Mv;
  float ph4Mv;
};

void cloudBegin(const char* bootId);
/**
 * Current pH calibration: saved in the app (devices/{DEVICE_ID}.phCalibration), fetched from
 * Firestore at start and every CALIBRATION_REFRESH_MS, and kept in flash (NVS) so it survives
 * a restart while offline. Falls back to the nominal PH7_MV/PH4_MV from config.h.
 */
const PhCalibration& cloudCalibration();
/** Queues a reading; when the queue is full the oldest is dropped (and logged). */
void cloudEnqueue(const Reading& r);
/** Call every loop(): signs in, refreshes the token and uploads queued readings when possible. */
void cloudLoop();
size_t cloudPending();
