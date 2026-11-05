# Triage guide

Symptom → checks → likely layer → where to look. Work down the layers in order (sensor → board → upload → database → app); fix the first one that fails. A number on screen is not proof the layers above it work.

Layers: **Sensor** (wiring, probe) · **Board** (firmware, Wi-Fi) · **Upload** (Firebase Auth + Firestore REST) · **Database** (Firestore data and rules) · **App** (phone) · **Build** (GitHub Actions APK).

## The app

| Symptom | Check, in order | Likely layer | Where |
|---|---|---|---|
| "No device connected" | Firestore console > `devices`: is there a document whose `ownerUid` is **your** user ID (Authentication > Users)? | Database | `docs/device-setup.md` step 2 |
| Analytics or Calibrate pH: `Could not load data (invalid-argument). Limit value ... over the maximum value of 10000` | A query asked for more than 10,000 documents; Firestore rejects that for live listeners (the emulator and one-time queries do not). Fixed in app 0.6.3 (`HISTORY_LIMIT` = 10,000). | App | `services/devices.ts` |
| Device shows **Stale** or **Offline** | Board powered? Serial shows `[cloud] saved #…`? Wi-Fi reachable? `readingIntervalSec` in the device record matches `READING_INTERVAL_MS`? | Board / Upload | serial; `firmware/tubigtala/config.h` |
| A card shows **—** | That sensor sent `null`: DS18B20 unplugged (-127), pH voltage clipped, MQ-137 still warming up (first 3 min). Serial `READING` line shows which. | Sensor | `docs/wiring.md`; `tubigtala.ino` |
| pH tagged **Uncalibrated** | Settings > Device > Calibrate pH. After saving, serial shows `[cloud] pH calibration applied` within 10 min. | Board | `docs/wiring.md` Calibration |
| No alert when a card is red | Alerts are raised **only while the app is open** (no server yet). The same condition does not re-alert within 30 min. Check Firestore `users/{uid}/alertState`. | App | `mobile/src/services/alerts.ts`, `domain/alerts.ts` |
| Alert in the bell list but no phone notification | Expo Go on Android cannot show them (APK only). Settings > Allow notifications on? Android Settings > Apps > TubigTala > Notifications allowed? | App | `services/notifications.ts` |
| Every value seems out of range | The ranges are **placeholders** until the water type is decided. | App | `mobile/src/domain/thresholds.ts` |
| "Could not save" on sign-up or the phone step | Live Firestore rules older than the app: redeploy (`firebase use` must print `tubigtala-64d9e`, then `firebase deploy --only firestore`). | Database | `firestore.rules` |
| Google sign-in "Developer error" / code 10 | APK signed with a different keystore than the SHA-1 registered in Firebase, or `google-services.json` secret outdated. | Build | `docs/runbook.md` APK builds |
| Email sign-in "incorrect" for a correct password | Authentication > Sign-in method > Email/Password enabled? | Database | Firebase console |
| Excel export fails | Online? (needs a connection). A range over 10,000 readings (a full 7 days at one a minute is 10,080) is truncated, not failed - the file says so. | App | `services/export.ts` |
| Banner "Offline · showing last saved data" when online | Phone's internet (not just Wi-Fi association). Data shown is the last copy saved on the phone. | App | `hooks/use-online.ts`, `hooks/use-cached.ts` |
| Errors mention `resource-exhausted` / quota | Spark free tier: 50,000 reads/day. Firebase console > Firestore > Usage. Long charts/exports and many open phones add up. | Database | `docs/shutdown-and-costs.md` |

## The board (serial at 115200; opening the port resets the board)

| Serial says | Cause | Check |
|---|---|---|
| `[wifi] not connected, retrying` | Wrong SSID/password, 5 GHz network, out of range | `secrets.h`; 2.4 GHz |
| `sign-in failed (HTTP 400)` | Wrong device email/password, or Email/Password sign-in disabled | Authentication > Users; Sign-in method. Test the same credentials from the PC with the Identity Toolkit `accounts:signInWithPassword` request: The board prints the code (firmware 0.2.4+). `INVALID_LOGIN_CREDENTIALS` = email or password wrong (Google does not say which); `API_KEY_INVALID` = `FIREBASE_API_KEY` wrong; `TOO_MANY_ATTEMPTS_TRY_LATER` = temporary lock after many failed sign-ins (e.g. an old password still on the board) - it clears by itself within minutes once the right password is flashed. The console cannot set a password: delete and re-add the user, then copy its new UID into `devices/{DEVICE_ID}.deviceUid`. |
| `assert failed: udp_new_ip_type … Required to lock TCPIP core functionality!` then `Rebooting...` | SNTP started with server **names** left a DNS lookup pending; the first HTTPS request cleared the DNS cache and ran SNTP's callback without the lwIP lock (ESP32 core 3.3.11). Fixed in firmware 0.2.3 by using NTP server IPs. | `config.h` `NTP_SERVER_1/2` must stay IP addresses; decode a backtrace with `xtensa-esp32-elf-addr2line -pfiaC -e .arduino-build\tubigtala.ino.elf <addresses>` |
| `G34 … CLIPPED` in `diag` with no probe on the BNC | The pH board's output swings to its 5 V rail with nothing connected; the divider keeps the pin at about 3.1 V (safe). Not a fault. | Connect the probe (or short the BNC centre to its shell = about pH 7) |
| `HTTP -1` on sign-in or upload | No internet, DNS, or TLS (certificate) failure | Router; `google_roots.h` (valid to 2036) |
| `rejected by rules … check provisioning` | `devices/{DEVICE_ID}` missing, its `deviceUid` is not this board's account, `simulated` not `false`, or a value out of range | `docs/device-setup.md` step 2; `firestore.rules` |
| `could not read device record (HTTP 403/404)` | Same as above; the board retries every minute, not continuously | step 2 |
| `queue full, dropping` | Offline over an hour (60 readings) - those readings are lost | Wi-Fi / internet |
| `ignoring invalid pH calibration` | Buffers saved less than 100 or more than 1500 mV apart | Recalibrate in the app |

## Builds and local tools

| Symptom | Cause | Fix |
|---|---|---|
| APK workflow fails at "Check version matches app.json" | Version typed in the workflow differs from `mobile/app.json` | Use the same version |
| APK workflow fails at "Check Firebase config variables" / "Restore …" | Repo variable or secret missing | `docs/runbook.md` APK builds |
| `getReactNativePersistence is not a function` while bundling | Expo web `output: "server"` came back in `app.json` | Remove it (see git log `904e2d2`) |
| Expo Go red screen `Cannot find native module 'ExpoTopicSubscriptionModule'` | Old code importing `expo-notifications` eagerly in Expo Go | `services/notifications.ts` guards it |
| Expo Go "Unable to resolve" a file that exists | Dev server started in CI mode does not see new files | Restart `npx expo start` |
| `firebase-tools no longer supports Java version before 21` | Emulators run outside `devtools` scripts | Use `npm run …` in `devtools/` (uses `.tools/jdk-21`) |
| Claude cannot run `firebase deploy` | Blocked by Claude Code's safety check by design | Run it yourself (commands above) |
