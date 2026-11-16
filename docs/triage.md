# Triage guide

Symptom → checks → likely layer → where to look. Work down the layers in order (sensor → board → upload → database → app); fix the first one that fails. A number on screen is not proof the layers above it work.

Layers: **Sensor** (wiring, probe) · **Board** (firmware, Wi-Fi) · **Upload** (Firebase Auth + Firestore REST) · **Database** (Firestore data and rules) · **App** (phone) · **Build** (GitHub Actions APK).

## The app

| Symptom | Check, in order | Likely layer | Where |
|---|---|---|---|
| "No device connected" | Firestore console > `devices`: is there a document whose `ownerUid` is **your** user ID (Authentication > Users)? | Database | `docs/device-setup.md` step 2 |
| Analytics or Calibrate pH: `Could not load data (invalid-argument). Limit value ... over the maximum value of 10000` | A query asked for more than 10,000 documents; Firestore rejects that for live listeners (the emulator and one-time queries do not). Fixed in app 0.6.3 (`HISTORY_LIMIT` = 10,000). | App | `services/devices.ts` |
| Device shows **Stale** or **Offline** | Board powered? Serial shows `[cloud] saved #…`? Wi-Fi reachable? `readingIntervalSec` in the device record matches `READING_INTERVAL_MS`? | Board / Upload | serial; `firmware/tubigtala/config.h` |
| A card shows **—** | That sensor sent `null`: DS18B20 unplugged (-127) or above its range (firmware **up to 0.3.2: above 60 °C**, so kettle-hot test water read as no value, not "too hot"; 0.3.3+: above 125 °C), pH voltage clipped, MQ-137 still warming up (first 3 min). Serial `READING` line shows which. After 10 minutes without a value the backend sends "… sensor not reading" (row below). | Sensor | `docs/wiring.md`; `tubigtala.ino`; `config.h` |
| Alert "… sensor not reading" | That field has had no value for 10 minutes (one alert per run; it ends at the next value). Temperature: probe wires in the screw terminal. pH: board power, probe cable, probe in liquid. Gas: sensor wires (its 3-minute warm-up after a restart never alerts). Firestore `users/{uid}/alertState/{deviceId}_{metric}.missingSince` = since when. | Sensor | `functions/src/health.ts`, `readings.ts` |
| Alert "… offline" / "… back online" | No reading for 15 minutes (the app's Offline rule), checked every 5 minutes, so it arrives 15–20 min after the last reading: power, Wi-Fi (`RTDSNet`), board stuck (serial). Expected when you unplug the station on purpose. **No offline alert when one was due:** `firebase functions:log --only checkStations` (the Cloud Scheduler job runs it); state in `users/{uid}/alertState/{deviceId}_offline`. | Board / Backend | `functions/src/stations.ts` |
| pH tagged **Uncalibrated** | Settings > Device > Calibrate pH. After saving, serial shows `[cloud] pH calibration applied` within 10 min. | Board | `docs/wiring.md` Calibration |
| No alert when a card is red | The server (`onReadingCreated`) checks every reading, app open or closed. **Cooldown:** a field that alerted at this level or worse in the last 30 min does not alert again, and since its level then stays red, that whole spell raises no new alert (no push, no second SMS). Wait 30 min after the last alert before re-testing. Check `users/{uid}/alertState` (`alertedAt`) and `firebase functions:log --only onReadingCreated`. | Backend | `functions/src/readings.ts`, `mobile/src/domain/alerts.ts` |
| Alert in the bell list but no phone notification | Firestore `alertDeliveries/push_{uid}_{alertId}`: **`skipped: no phone registered`** = nothing in `users/{uid}/pushTokens` - install app 0.9.2+ and open it once with Settings > Phone notifications on and Android's notification permission allowed (Expo Go cannot register). **`failed`** = `detail` has the FCM error. **`sent \| FCM accepted 1/1`** = Google has it; the phone hid it: silent / Do Not Disturb, Android Settings > Apps > TubigTala > Notifications, Force stop (blocks notifications until the app is opened again), battery restrictions on some brands. No record at all = no alert was raised (row above). | Backend / App | `functions/src/readings.ts` `sendPush`; `mobile/src/hooks/use-push-registration.ts` |
| Every value seems out of range | Ranges are for fresh/tap water (pH 6.5–8.5, 20–32 °C); ammonia gas is relative to tank-01's clean-air baseline (normal up to 1700 mV) - re-record it if the sensor or enclosure changes (`docs/data-model.md`). | App | `mobile/src/domain/thresholds.ts` |
| "Could not save" on sign-up or the phone step | Live Firestore rules older than the app: redeploy (`firebase use` must print `tubigtala-64d9e`, then `firebase deploy --only firestore`). | Database | `firestore.rules` |
| Still signed in after uninstalling and reinstalling | Android's automatic app backup restored the app's saved sign-in (Firebase Auth keeps it in AsyncStorage). Turned off in 0.9.3 (`android.allowBackup: false` in `mobile/app.json`); a backup made by an older version is not restored into 0.9.3+. Updating over an installed version still keeps you signed in - that is normal. | App | `mobile/app.json` |
| Google sign-in "Developer error" / code 10 | APK signed with a different keystore than the SHA-1 registered in Firebase, or `google-services.json` secret outdated. | Build | `docs/runbook.md` APK builds |
| Email sign-in "incorrect" for a correct password | Authentication > Sign-in method > Email/Password enabled? | Database | Firebase console |
| Excel export fails | Online? (needs a connection). A range over 10,000 readings (a full 7 days at one a minute is 10,080) is truncated, not failed - the file says so. | App | `services/export.ts` |
| Banner "Offline · showing last saved data" when online | Phone's internet (not just Wi-Fi association). Data shown is the last copy saved on the phone. | App | `hooks/use-online.ts`, `hooks/use-cached.ts` |
| Firestore reads higher than expected | Blaze since 16 Nov 2026: past the free 50,000 reads a day (the day starts at midnight US Pacific time, 4 PM / 3 PM in the Philippines) reads are billed, not refused. Normal load: station + alert function about 6,000 a day. Big readers: Analytics By date and Excel export (every reading in the range; 7 days ≈ 10,000) and Analytics Live (0.9.3+: reloads once an hour and stops in the background; up to 0.9.2: every 5 min, even in the background - update the app). Per-hour numbers: Cloud Monitoring metric `firestore.googleapis.com/document/read_count`. | Database / App | `docs/shutdown-and-costs.md`; `mobile/src/app/(app)/(tabs)/analytics.tsx` |

## The board (serial at 115200; opening the port resets the board)

| Serial says | Cause | Check |
|---|---|---|
| `[wifi] not connected, retrying` | Wrong SSID/password, 5 GHz network, out of range | Set it from a phone (`docs/device-setup.md` step 6); 2.4 GHz |
| `[wifi] … opening the setup network` | No known network works since start (new place), or BOOT was held 3 s | Join `TubigTala-Setup-<id>` with the setup sticker; `diag` shows `Setup: … open` |
| `[wifi] "X" did not connect: wrong password (reason 15)` | The setup page's password was wrong (reason codes: 15/202/204 password, 201/210-212 not found) | Try again on the page; nothing was saved |
| `sign-in failed (HTTP 400)` | Wrong device email/password, or Email/Password sign-in disabled | Authentication > Users; Sign-in method. Test the same credentials from the PC with the Identity Toolkit `accounts:signInWithPassword` request: The board prints the code (firmware 0.2.4+). `INVALID_LOGIN_CREDENTIALS` = email or password wrong (Google does not say which); `API_KEY_INVALID` = `FIREBASE_API_KEY` wrong; `TOO_MANY_ATTEMPTS_TRY_LATER` = temporary lock after many failed sign-ins (e.g. an old password still on the board) - it clears by itself within minutes once the right password is flashed. The console cannot set a password: delete and re-add the user, then copy its new UID into `devices/{DEVICE_ID}.deviceUid`. |
| `assert failed: udp_new_ip_type … Required to lock TCPIP core functionality!` then `Rebooting...` | SNTP started with server **names** left a DNS lookup pending; the first HTTPS request cleared the DNS cache and ran SNTP's callback without the lwIP lock (ESP32 core 3.3.11). Fixed in firmware 0.2.3 by using NTP server IPs. | `config.h` `NTP_SERVER_1/2` must stay IP addresses; decode a backtrace with `xtensa-esp32-elf-addr2line -pfiaC -e .arduino-build\tubigtala.ino.elf <addresses>` |
| `G34 … CLIPPED` in `diag` with no probe on the BNC | The pH board's output swings toward its 5 V rail with nothing connected. Since 0.3.1 there is no divider on pH, only the 10 kΩ series resistor, which keeps the current into the pin tiny (safe, but don't leave it like that). | Connect the probe (or short the BNC centre to its shell = about pH 7) |
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
