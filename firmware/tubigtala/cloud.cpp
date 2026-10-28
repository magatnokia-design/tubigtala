// Firebase over plain REST (no Firebase library): Auth sign-in/refresh and a Firestore commit
// per reading. Response handling matches what the emulator returned on 27 Oct 2026:
//   200 created | 409 ALREADY_EXISTS (duplicate) | 403 PERMISSION_DENIED (rules)
//   401 expired/invalid token (production) or 400 "invalid jwt" (emulator) | other = retry later
#include "cloud.h"

#include <ArduinoJson.h>  // 6.21.5 only - shared with Dagitab, do not upgrade to 7
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "config.h"
#include "google_roots.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

#ifdef FIREBASE_EMULATOR_HOST
static const String AUTH_BASE = String("http://") + FIREBASE_EMULATOR_HOST + ":9099/identitytoolkit.googleapis.com/v1";
static const String TOKEN_URL = String("http://") + FIREBASE_EMULATOR_HOST + ":9099/securetoken.googleapis.com/v1/token";
static const String FS_BASE = String("http://") + FIREBASE_EMULATOR_HOST + ":8080/v1";
static const char* PROJECT = "demo-tubigtala";
#else
static const String AUTH_BASE = "https://identitytoolkit.googleapis.com/v1";
static const String TOKEN_URL = "https://securetoken.googleapis.com/v1/token";
static const String FS_BASE = "https://firestore.googleapis.com/v1";
static const char* PROJECT = FIREBASE_PROJECT_ID;
#endif

static String bootId;
static String idToken;
static String refreshToken;
static uint32_t tokenValidUntilMs = 0;

static Reading queue[UPLOAD_QUEUE_SIZE];
static uint8_t deniedCount[UPLOAD_QUEUE_SIZE];
static size_t qHead = 0, qCount = 0;

static PhCalibration calibration{false, PH7_MV, PH4_MV};
static uint32_t nextCalibrationFetchMs = 0;  // 0 = due now (first pass after boot)

static uint32_t nextAttemptMs = 0;
static uint32_t backoffMs = UPLOAD_BACKOFF_MIN_MS;

// ---------- HTTP ----------

struct Response {
  int status;  // HTTP status, or <0 for a connection error
  String body;
};

static Response post(const String& url, const String& body, const char* contentType, const String& bearer = "") {
  HTTPClient http;
#ifdef FIREBASE_EMULATOR_HOST
  WiFiClient client;
#else
  WiFiClientSecure client;
  client.setCACert(GOOGLE_ROOT_CAS);
#endif
  if (!http.begin(client, url)) return {-1, "begin failed"};
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", contentType);
  if (bearer.length()) http.addHeader("Authorization", "Bearer " + bearer);
  int status = http.POST(body);
  Response r{status, status > 0 ? http.getString() : http.errorToString(status)};
  http.end();
  return r;
}

static Response get(const String& url, const String& bearer) {
  HTTPClient http;
#ifdef FIREBASE_EMULATOR_HOST
  WiFiClient client;
#else
  WiFiClientSecure client;
  client.setCACert(GOOGLE_ROOT_CAS);
#endif
  if (!http.begin(client, url)) return {-1, "begin failed"};
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Authorization", "Bearer " + bearer);
  int status = http.GET();
  Response r{status, status > 0 ? http.getString() : http.errorToString(status)};
  http.end();
  return r;
}

static void backoff() {
  nextAttemptMs = millis() + backoffMs;
  backoffMs = min<uint32_t>(backoffMs * 2, UPLOAD_BACKOFF_MAX_MS);
}

// ---------- Auth ----------

static bool storeTokens(const String& body, const char* idKey, const char* refreshKey, const char* expiresKey) {
  StaticJsonDocument<96> filter;
  filter[idKey] = true;
  filter[refreshKey] = true;
  filter[expiresKey] = true;
  DynamicJsonDocument doc(4096);
  if (deserializeJson(doc, body, DeserializationOption::Filter(filter))) return false;
  const char* id = doc[idKey];
  const char* refresh = doc[refreshKey];
  if (!id || !refresh) return false;
  idToken = id;
  refreshToken = refresh;
  long expiresSec = String(doc[expiresKey] | "3600").toInt();
  // Renew 5 minutes early so a request never goes out with a token about to expire.
  tokenValidUntilMs = millis() + (uint32_t)max(60L, expiresSec - 300) * 1000UL;
  return true;
}

static bool signIn() {
  StaticJsonDocument<256> req;
  req["email"] = DEVICE_EMAIL;
  req["password"] = DEVICE_PASSWORD;
  req["returnSecureToken"] = true;
  String body;
  serializeJson(req, body);
  Response r = post(AUTH_BASE + "/accounts:signInWithPassword?key=" + FIREBASE_API_KEY, body, "application/json");
  if (r.status == 200 && storeTokens(r.body, "idToken", "refreshToken", "expiresIn")) {
    Serial.println("[cloud] signed in");
    return true;
  }
  // Never print the password or tokens; the status and Firebase's error code are enough.
  Serial.printf("[cloud] sign-in failed (HTTP %d) - check DEVICE_EMAIL/PASSWORD and FIREBASE_API_KEY\n", r.status);
  return false;
}

static bool refreshIdToken() {
  Response r = post(TOKEN_URL + "?key=" + FIREBASE_API_KEY, "grant_type=refresh_token&refresh_token=" + refreshToken,
                    "application/x-www-form-urlencoded");
  if (r.status == 200 && storeTokens(r.body, "id_token", "refresh_token", "expires_in")) return true;
  Serial.printf("[cloud] token refresh failed (HTTP %d), signing in again\n", r.status);
  return false;
}

static bool ensureToken() {
  // Signed difference survives millis() wrapping around (every ~49.7 days).
  if (idToken.length() && (int32_t)(tokenValidUntilMs - millis()) > 0) return true;
  if (refreshToken.length() && refreshIdToken()) return true;
  return signIn();
}

static void dropToken() {
  idToken = "";
  tokenValidUntilMs = 0;
}

// ---------- Firestore ----------

static void putNumber(JsonObject fields, const char* key, float v, int decimals) {
  JsonObject o = fields.createNestedObject(key);
  if (isnan(v)) {
    o["nullValue"] = serialized("null");
  } else {
    double scale = pow(10.0, decimals);
    o["doubleValue"] = round((double)v * scale) / scale;
  }
}

static String buildCommit(const Reading& r) {
  DynamicJsonDocument doc(2048);
  JsonObject write = doc.createNestedArray("writes").createNestedObject();
  JsonObject update = write.createNestedObject("update");
  update["name"] = String("projects/") + PROJECT + "/databases/(default)/documents/devices/" + DEVICE_ID +
                   "/readings/" + bootId + "-" + r.seq;
  JsonObject f = update.createNestedObject("fields");
  f.createNestedObject("bootId")["stringValue"] = bootId;
  f.createNestedObject("seq")["integerValue"] = String(r.seq);
  if (r.deviceTime > 0) {
    char iso[25];
    struct tm utc;
    gmtime_r(&r.deviceTime, &utc);
    strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%SZ", &utc);
    f.createNestedObject("deviceTime")["timestampValue"] = iso;
  } else {
    f.createNestedObject("deviceTime")["nullValue"] = serialized("null");
  }
  putNumber(f, "ph", r.ph, 2);
  f.createNestedObject("phCalibrated")["booleanValue"] = r.phCalibrated;
  putNumber(f, "phMv", r.phMv, 0);
  putNumber(f, "temperatureC", r.temperatureC, 2);
  putNumber(f, "nh3GasMv", r.nh3GasMv, 0);
  f.createNestedObject("simulated")["booleanValue"] = false;
  f.createNestedObject("firmware")["stringValue"] = FIRMWARE_VERSION;
  // Create-only: an existing reading (a retry) fails with 409 instead of being overwritten.
  write.createNestedObject("currentDocument")["exists"] = false;
  // serverTime is set by Firestore; the rules require it to equal the request time.
  JsonObject t = write.createNestedArray("updateTransforms").createNestedObject();
  t["fieldPath"] = "serverTime";
  t["setToServerValue"] = "REQUEST_TIME";
  String out;
  serializeJson(doc, out);
  return out;
}

enum class Upload { Saved, Duplicate, AuthFailed, Rejected, RetryLater };

static Upload upload(const Reading& r) {
  Response res = post(FS_BASE + "/projects/" + PROJECT + "/databases/(default)/documents:commit", buildCommit(r),
                       "application/json", idToken);
  if (res.status == 200) return Upload::Saved;
  if (res.status == 409) return Upload::Duplicate;
  if (res.status == 401 || (res.status == 400 && res.body.indexOf("jwt") >= 0)) return Upload::AuthFailed;
  if (res.status == 403) return Upload::Rejected;
  Serial.printf("[cloud] upload #%u failed (HTTP %d), will retry\n", r.seq, res.status);
  return Upload::RetryLater;
}

// ---------- pH calibration ----------

// Firestore numbers arrive as {"integerValue":"2510"} or {"doubleValue":2510.5}.
static float firestoreNumber(JsonVariantConst v) {
  if (v.containsKey("doubleValue")) return v["doubleValue"].as<float>();
  if (v.containsKey("integerValue")) return String(v["integerValue"].as<const char*>()).toFloat();
  return NAN;
}

static void saveCalibrationToFlash() {
  Preferences prefs;
  prefs.begin("tubigtala", false);
  prefs.putBool("phCal", calibration.calibrated);
  prefs.putFloat("ph7Mv", calibration.ph7Mv);
  prefs.putFloat("ph4Mv", calibration.ph4Mv);
  prefs.end();
}

static void loadCalibrationFromFlash() {
  Preferences prefs;
  prefs.begin("tubigtala", true);
  if (prefs.getBool("phCal", false)) {
    calibration = {true, prefs.getFloat("ph7Mv", PH7_MV), prefs.getFloat("ph4Mv", PH4_MV)};
    Serial.printf("[cloud] pH calibration from flash: pH7 %.0f mV, pH4 %.0f mV\n", calibration.ph7Mv, calibration.ph4Mv);
  }
  prefs.end();
}

/** Reads devices/{DEVICE_ID}.phCalibration; true if the request worked (even if unchanged). */
static bool fetchCalibration() {
  Response r = get(FS_BASE + "/projects/" + PROJECT + "/databases/(default)/documents/devices/" + DEVICE_ID, idToken);
  if (r.status == 401 || (r.status == 400 && r.body.indexOf("jwt") >= 0)) {
    dropToken();
    return false;
  }
  if (r.status != 200) {
    Serial.printf("[cloud] could not read device record (HTTP %d)%s\n", r.status,
                  r.status == 403 || r.status == 404 ? " - check provisioning" : "");
    return false;
  }
  StaticJsonDocument<128> filter;
  filter["fields"]["phCalibration"] = true;
  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, r.body, DeserializationOption::Filter(filter))) return false;
  JsonVariantConst f = doc["fields"]["phCalibration"]["mapValue"]["fields"];
  bool calibrated = f["status"]["stringValue"] == "calibrated";
  float ph7 = firestoreNumber(f["ph7Mv"]);
  float ph4 = firestoreNumber(f["ph4Mv"]);
  // Same sanity rule as the app (domain/calibration.ts) and firestore.rules: buffers between
  // 100 and 1500 mV apart, either direction (some pH modules invert their output).
  if (calibrated && (isnan(ph7) || isnan(ph4) || fabsf(ph7 - ph4) < 100 || fabsf(ph7 - ph4) > 1500)) {
    Serial.println("[cloud] ignoring invalid pH calibration in device record");
    return true;
  }
  PhCalibration next = calibrated ? PhCalibration{true, ph7, ph4} : PhCalibration{false, PH7_MV, PH4_MV};
  if (next.calibrated != calibration.calibrated || next.ph7Mv != calibration.ph7Mv || next.ph4Mv != calibration.ph4Mv) {
    calibration = next;
    saveCalibrationToFlash();
    if (calibration.calibrated) Serial.printf("[cloud] pH calibration applied: pH7 %.0f mV, pH4 %.0f mV\n", ph7, ph4);
    else Serial.println("[cloud] pH calibration removed, using nominal values");
  }
  return true;
}

const PhCalibration& cloudCalibration() {
  return calibration;
}

// ---------- Queue ----------

static void popHead() {
  qHead = (qHead + 1) % UPLOAD_QUEUE_SIZE;
  qCount--;
}

void cloudBegin(const char* id) {
  bootId = id;
  loadCalibrationFromFlash();
}

void cloudEnqueue(const Reading& r) {
  if (qCount == UPLOAD_QUEUE_SIZE) {
    Serial.printf("[cloud] queue full, dropping unsent reading #%u\n", queue[qHead].seq);
    popHead();
  }
  size_t slot = (qHead + qCount) % UPLOAD_QUEUE_SIZE;
  queue[slot] = r;
  deniedCount[slot] = 0;
  qCount++;
}

size_t cloudPending() {
  return qCount;
}

void cloudLoop() {
  if (WiFi.status() != WL_CONNECTED || (int32_t)(millis() - nextAttemptMs) < 0) return;
  // Due at start (nextCalibrationFetchMs = 0 counts as due), then every CALIBRATION_REFRESH_MS
  // after a success or CALIBRATION_RETRY_MS after a failure - never on every loop, which would
  // burn the project's daily Firestore read quota if the record cannot be read.
  bool calibrationDue = nextCalibrationFetchMs == 0 || (int32_t)(millis() - nextCalibrationFetchMs) >= 0;
  if (!qCount && !calibrationDue) return;
  if (!ensureToken()) {
    backoff();
    return;
  }
  if (calibrationDue) {
    bool ok = fetchCalibration();
    nextCalibrationFetchMs = millis() + (ok ? CALIBRATION_REFRESH_MS : CALIBRATION_RETRY_MS);
    if (nextCalibrationFetchMs == 0) nextCalibrationFetchMs = 1;  // 0 means "due now"
    // The read can drop an expired token; uploading without one would look like a rules
    // rejection and could wrongly discard good readings. Sign in again on the next pass.
    if (!idToken.length()) {
      backoff();
      return;
    }
  }
  // A few per loop so a backlog drains without starving the sensor schedule.
  for (int sent = 0; sent < 5 && qCount; sent++) {
    Reading& r = queue[qHead];
    switch (upload(r)) {
      case Upload::Saved:
        Serial.printf("[cloud] saved #%u (%u waiting)\n", r.seq, (unsigned)qCount - 1);
        popHead();
        backoffMs = UPLOAD_BACKOFF_MIN_MS;
        break;
      case Upload::Duplicate:  // an earlier attempt succeeded but the reply was lost
        Serial.printf("[cloud] #%u already saved\n", r.seq);
        popHead();
        break;
      case Upload::AuthFailed:
        dropToken();
        backoff();
        return;
      case Upload::Rejected: {
        // The rules refused it: the device is not provisioned (devices/DEVICE_ID with this
        // account's uid as deviceUid) or a value is out of the allowed range. Retry a few
        // times in case provisioning is in progress, then drop it so it cannot block the queue.
        uint8_t& tries = deniedCount[qHead];
        if (++tries >= MAX_REJECTED_TRIES) {
          Serial.printf("[cloud] #%u rejected by rules %u times, dropped - check provisioning\n", r.seq, tries);
          popHead();
        } else {
          Serial.printf("[cloud] #%u rejected by rules (try %u), retrying later\n", r.seq, tries);
          backoff();
          return;
        }
        break;
      }
      case Upload::RetryLater:
        backoff();
        return;
    }
  }
}
