#pragma once
// Template. Copy to secrets.h (git-ignored) and fill in - never commit secrets.h.
// Without secrets.h the sketch still compiles with these placeholders, but cannot upload.

// Wi-Fi (2.4 GHz; the ESP32 cannot join 5 GHz networks)
#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// Firebase web API key of tubigtala-64d9e (Firebase console > Project settings > General >
// Web API key). Identifies the project; not a secret on its own, kept here to stay out of git.
#define FIREBASE_API_KEY "your-web-api-key"

// This board's identity: the devices/{DEVICE_ID} document and the Firebase Auth account whose
// uid is that document's deviceUid (docs/data-model.md). One account per board; the account
// can only write readings for this device, so a leaked password exposes one device's uploads.
#define DEVICE_ID "tank-01"
#define DEVICE_EMAIL "tank-01@devices.tubigtala.app"
#define DEVICE_PASSWORD "long-random-password"

// Optional bench testing against the Firebase emulators on a PC (devtools: npm run emulators).
// Uncomment and set the PC's LAN IP; uploads then go over plain HTTP to the emulator.
// #define FIREBASE_EMULATOR_HOST "192.168.1.10"
