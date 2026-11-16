// Wi-Fi with self-setup from a phone (firmware 0.4.0; docs/device-setup.md, "Wi-Fi setup").
//
// Which network: the one saved in this station's flash by the setup page; if none was saved,
// WIFI_SSID from secrets.h (may be left empty for a station handed to someone else).
//
// Setup mode: the station opens its own Wi-Fi "TubigTala-Setup-<DEVICE_ID>" - WPA2 with
// SETUP_AP_PASSWORD from secrets.h (printed as a QR on the station's setup sticker), or open if
// that is not set - and a setup page that phones open by themselves (captive portal; also at
// http://192.168.4.1). It opens when
//  - no network is known at all,
//  - the known network has not worked since this start for WIFI_SETUP_AFTER_MS (a new place, a
//    changed password). A station that was online and then loses its router does NOT open it:
//    it keeps retrying, so a router restart never needs a phone;
//  - the BOOT button is held for SETUP_BUTTON_HOLD_MS, or the serial command `wifi` (to change
//    networks; the blue LED blinks while the setup network is open).
// While no phone is on the setup network, the station retries the known network every
// WIFI_SETUP_RETRY_MS and closes setup as soon as it works (unless setup was opened on purpose).
// On the page the user picks a network and types its password; the station tries it for up to
// WIFI_TEST_MS and saves it only if it connects, then closes the setup network.
//
// Only the ESP32 core's own WiFi, WebServer, DNSServer and Preferences: nothing new is installed
// in the Arduino sketchbook shared with Dagitab (CLAUDE.md).
#include "wifisetup.h"

#include <DNSServer.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>

#include "config.h"
#include "setup_page.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

#ifndef WIFI_SSID
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
#endif
#ifndef SETUP_AP_PASSWORD
#define SETUP_AP_PASSWORD ""
#endif

namespace {

struct Net {
  String ssid;
  int32_t rssi;
  bool open;
  int32_t channel;
};
constexpr int MAX_NETS = 20;
Net nets[MAX_NETS];
int netCount = 0;

enum class Mode : uint8_t { Normal, Setup };
enum class Test : uint8_t { Idle, Connecting, Connected, Failed };

Mode mode = Mode::Normal;
Test test = Test::Idle;
bool manualSetup = false;
String knownSsid, knownPass;  // the network the station uses
bool knownFromFlash = false;
String trySsid, tryPass, failText;  // being tried from the setup page
uint32_t testStartMs = 0, testDoneMs = 0, lastClientMs = 0, lastRetryMs = 0, lastAttemptMs = 0;
uint32_t buttonDownMs = 0, ledMs = 0;
bool buttonDone = false, ledOn = false;
volatile bool gotIpSinceBoot = false;
volatile uint8_t lastReason = 0;  // last disconnect reason from the Wi-Fi driver
char apName[33];

WebServer server(80);
DNSServer dns;

void led(bool on) {
  if (on == ledOn) return;
  ledOn = on;
  digitalWrite(PIN_STATUS_LED, on ? HIGH : LOW);
}

bool isPlaceholder(const char* s) { return !*s || strcmp(s, "your-wifi-name") == 0; }

void loadKnown() {
  Preferences p;
  p.begin("wifi", false);
  knownSsid = p.getString("ssid", "");
  knownPass = p.getString("pass", "");
  p.end();
  knownFromFlash = knownSsid.length() > 0;
  if (!knownFromFlash && !isPlaceholder(WIFI_SSID)) {
    knownSsid = WIFI_SSID;
    knownPass = WIFI_PASSWORD;
  }
}

void saveKnown(const String& ssid, const String& pass) {
  Preferences p;
  p.begin("wifi", false);
  p.putString("ssid", ssid);
  p.putString("pass", pass);
  p.end();
  knownSsid = ssid;
  knownPass = pass;
  knownFromFlash = true;
}

void beginStation(const String& ssid, const String& pass) {
  WiFi.begin(ssid.c_str(), pass.length() ? pass.c_str() : nullptr);
}

void connectKnown() {
  lastAttemptMs = millis();
  if (knownSsid.length()) beginStation(knownSsid, knownPass);
}

// Plain words for the page. Reason codes: ESP-IDF wifi_err_reason_t.
const char* reasonText(uint8_t r) {
  switch (r) {
    case 0: return "no answer from the network";
    case 201:                   // NO_AP_FOUND
    case 210: case 211: case 212:  // no AP with compatible security / auth mode / signal
      return "network not found (check the name; it must be 2.4 GHz and in range)";
    case 202:  // AUTH_FAIL
    case 15:   // 4WAY_HANDSHAKE_TIMEOUT
    case 204:  // HANDSHAKE_TIMEOUT
      return "wrong password";
    default: return "the network refused the connection";
  }
}

String jsonStr(const String& s) {
  String o;
  o.reserve(s.length() + 2);
  o += '"';
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '"' || c == '\\') {
      o += '\\';
      o += c;
    } else if ((uint8_t)c < 0x20) {
      char b[8];
      snprintf(b, sizeof(b), "\\u%04x", (uint8_t)c);
      o += b;
    } else {
      o += c;
    }
  }
  o += '"';
  return o;
}

// Before the setup network exists (scanning while it runs would take its radio off-channel).
void scanNetworks() {
  int n = WiFi.scanNetworks();
  netCount = 0;
  for (int i = 0; i < n; i++) {
    String s = WiFi.SSID(i);
    if (!s.length()) continue;  // hidden networks
    int j = 0;
    while (j < netCount && nets[j].ssid != s) j++;
    if (j < netCount) {  // same name seen again (mesh / two bands): keep the strongest
      if (WiFi.RSSI(i) > nets[j].rssi) nets[j] = {s, WiFi.RSSI(i), WiFi.encryptionType(i) == WIFI_AUTH_OPEN, WiFi.channel(i)};
      continue;
    }
    if (netCount == MAX_NETS) continue;
    nets[netCount++] = {s, WiFi.RSSI(i), WiFi.encryptionType(i) == WIFI_AUTH_OPEN, WiFi.channel(i)};
  }
  WiFi.scanDelete();
  for (int a = 1; a < netCount; a++) {  // strongest first
    for (int b = a; b > 0 && nets[b].rssi > nets[b - 1].rssi; b--) {
      Net t = nets[b];
      nets[b] = nets[b - 1];
      nets[b - 1] = t;
    }
  }
}

void openSetup(const char* why, bool manual) {
  if (mode == Mode::Setup) return;
  Serial.printf("[wifi] %s - opening the setup network\n", why);
  bool online = WiFi.status() == WL_CONNECTED;
  if (!online) WiFi.disconnect();  // a connection attempt in progress would make the scan fail
  scanNetworks();
  // The setup network shares the radio with the station's own connection: put it on the channel
  // the station is on (or most likely will be), so choosing that network does not move it.
  int channel = online ? WiFi.channel() : (netCount ? nets[0].channel : 1);
  if (channel < 1 || channel > 13) channel = 1;
  WiFi.mode(WIFI_AP_STA);
  const char* pass = strlen(SETUP_AP_PASSWORD) >= 8 ? SETUP_AP_PASSWORD : nullptr;
  WiFi.softAP(apName, pass, channel);
  dns.start(53, "*", WiFi.softAPIP());  // every name answers with the station: the page opens by itself
  server.begin();
  mode = Mode::Setup;
  manualSetup = manual;
  test = Test::Idle;
  lastClientMs = lastRetryMs = millis();
  Serial.printf("[wifi] setup network \"%s\" (%s) on channel %d, %d network(s) found; page at http://%s\n", apName,
                pass ? "password on the station's setup sticker" : "open, no password", channel, netCount,
                WiFi.softAPIP().toString().c_str());
}

void closeSetup(const char* why) {
  server.stop();
  dns.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  mode = Mode::Normal;
  test = Test::Idle;
  manualSetup = false;
  led(false);
  Serial.printf("[wifi] setup network closed (%s)\n", why);
  if (WiFi.status() != WL_CONNECTED) connectKnown();
}

// ---- Setup page handlers ----

void sendPage() { server.send_P(200, "text/html", SETUP_PAGE); }

// Captive portal: any other address (phones test e.g. /generate_204) leads to the setup page.
void redirectToPage() {
  server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
  server.send(302, "text/plain", "");
}

void sendScan() {
  String o = "[";
  for (int i = 0; i < netCount; i++) {
    if (i) o += ',';
    o += "{\"ssid\":" + jsonStr(nets[i].ssid) + ",\"rssi\":" + String(nets[i].rssi) + ",\"open\":" + (nets[i].open ? "true" : "false") + "}";
  }
  o += ']';
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", o);
}

void startTest() {
  String ssid = server.arg("ssid");
  String pass = server.arg("pass");
  ssid.trim();
  if (!ssid.length() || ssid.length() > 32 || (pass.length() && pass.length() < 8) || pass.length() > 63) {
    server.send(400, "application/json", "{\"ok\":false}");
    return;
  }
  trySsid = ssid;
  tryPass = pass;
  failText = "";
  lastReason = 0;
  WiFi.disconnect();  // stop retrying the old network while this one is tried
  beginStation(trySsid, tryPass);
  test = Test::Connecting;
  testStartMs = millis();
  server.send(200, "application/json", "{\"ok\":true}");
  Serial.printf("[wifi] setup page: trying \"%s\"\n", trySsid.c_str());  // never the password
}

void sendStatus() {
  const char* st = test == Test::Connecting ? "connecting" : test == Test::Connected ? "connected" : test == Test::Failed ? "failed" : "idle";
  String o = String("{\"state\":\"") + st + "\",\"ssid\":" + jsonStr(trySsid) + ",\"reason\":" + jsonStr(failText) + "}";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", o);
}

void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) lastReason = info.wifi_sta_disconnected.reason;
  else if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) gotIpSinceBoot = true;
}

}  // namespace

void wifiBegin() {
  snprintf(apName, sizeof(apName), "TubigTala-Setup-%s", DEVICE_ID);
  pinMode(PIN_SETUP_BUTTON, INPUT_PULLUP);
  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);
  WiFi.onEvent(onWifiEvent);
  server.on("/", HTTP_GET, sendPage);
  server.on("/scan", HTTP_GET, sendScan);
  server.on("/connect", HTTP_POST, startTest);
  server.on("/status", HTTP_GET, sendStatus);
  server.onNotFound(redirectToPage);
  loadKnown();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  if (knownSsid.length()) {
    Serial.printf("[wifi] connecting to \"%s\" (%s)\n", knownSsid.c_str(), knownFromFlash ? "saved by the setup page" : "from secrets.h");
    connectKnown();
  } else {
    openSetup("no Wi-Fi known yet", false);
  }
}

void wifiLoop() {
  // BOOT button held: open the setup network to change networks.
  if (digitalRead(PIN_SETUP_BUTTON) == LOW) {
    if (!buttonDownMs) {
      buttonDownMs = millis();
    } else if (!buttonDone && millis() - buttonDownMs >= SETUP_BUTTON_HOLD_MS) {
      buttonDone = true;
      openSetup("BOOT button held", true);
    }
  } else {
    buttonDownMs = 0;
    buttonDone = false;
  }

  if (mode == Mode::Normal) {
    if (WiFi.status() == WL_CONNECTED) return;
    if (!knownSsid.length()) {
      openSetup("no Wi-Fi known", false);
    } else if (!gotIpSinceBoot && millis() >= WIFI_SETUP_AFTER_MS) {
      openSetup("could not join the known Wi-Fi since this start (new place or changed password?)", false);
    } else if (millis() - lastAttemptMs >= WIFI_RETRY_MS) {
      Serial.println("[wifi] not connected, retrying");
      WiFi.disconnect();
      connectKnown();
    }
    return;
  }

  // Setup mode
  dns.processNextRequest();
  server.handleClient();
  if (millis() - ledMs >= 500) {
    ledMs = millis();
    led(!ledOn);
  }
  bool phoneOn = WiFi.softAPgetStationNum() > 0;
  if (phoneOn) lastClientMs = millis();

  switch (test) {
    case Test::Connecting:
      if (WiFi.status() == WL_CONNECTED) {
        test = Test::Connected;
        testDoneMs = millis();
        saveKnown(trySsid, tryPass);
        gotIpSinceBoot = true;
        Serial.printf("[wifi] connected to \"%s\" - saved; closing setup soon\n", trySsid.c_str());
      } else if (millis() - testStartMs >= WIFI_TEST_MS) {
        test = Test::Failed;
        failText = reasonText(lastReason);
        WiFi.disconnect();
        Serial.printf("[wifi] \"%s\" did not connect: %s (reason %u)\n", trySsid.c_str(), failText.c_str(), (unsigned)lastReason);
      }
      break;
    case Test::Connected:
      if (millis() - testDoneMs >= SETUP_DONE_LINGER_MS) closeSetup("Wi-Fi set up");
      break;
    default:
      if (WiFi.status() == WL_CONNECTED) {
        // Online again with the known network (or never lost it): no need to stay open unless asked.
        if (!manualSetup && !phoneOn) closeSetup("the known Wi-Fi works again");
        else if (millis() - lastClientMs >= WIFI_SETUP_IDLE_MS) closeSetup("not used for 10 minutes");
      } else if (!phoneOn && knownSsid.length() && millis() - lastRetryMs >= WIFI_SETUP_RETRY_MS) {
        lastRetryMs = millis();  // nobody is setting up: try the known network again
        beginStation(knownSsid, knownPass);
      }
      break;
  }
}

void wifiOpenSetup() { openSetup("asked for (serial)", true); }

void wifiForget() {
  Preferences p;
  p.begin("wifi", false);
  p.clear();
  p.end();
  loadKnown();
  Serial.printf("[wifi] saved Wi-Fi forgotten; %s\n", knownSsid.length() ? "using the one in secrets.h" : "no network known - setup opens");
  WiFi.disconnect();
  if (mode == Mode::Normal && knownSsid.length()) connectKnown();
}

void wifiPrintStatus() {
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("Wi-Fi:  connected to \"%s\" (%s), signal %d dBm, IP %s\n", WiFi.SSID().c_str(),
                  knownFromFlash ? "saved by setup" : "from secrets.h", WiFi.RSSI(), WiFi.localIP().toString().c_str());
  } else if (knownSsid.length()) {
    Serial.printf("Wi-Fi:  NOT connected to \"%s\" (status %d, last reason %u)\n", knownSsid.c_str(), (int)WiFi.status(), (unsigned)lastReason);
  } else {
    Serial.println("Wi-Fi:  no network known - set it up from a phone");
  }
  if (mode == Mode::Setup) {
    Serial.printf("Setup:  \"%s\" open, %d phone(s) on it, page http://%s\n", apName, WiFi.softAPgetStationNum(),
                  WiFi.softAPIP().toString().c_str());
  }
}

const char* wifiNetworkName() { return knownSsid.c_str(); }
