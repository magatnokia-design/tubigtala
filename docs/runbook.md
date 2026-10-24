# Runbook: local development

How to run TubigTala on this PC with no hardware and no cloud services. Everything below uses the Firebase **emulators** under the project ID `demo-tubigtala`, so nothing reaches the real `tubigtala-64d9e` project (or Dagitab's).

Commands are PowerShell, run from the repo root `C:\App\TubigTala` unless stated.

## One-time setup

| Need | Check | Notes |
|---|---|---|
| Node 22+ | `node -v` | 24.20.0 installed (24 Oct 2026) |
| Firebase CLI | `firebase --version` | 15.28.2 |
| JDK 21+ for the emulators | `Test-Path .tools\jdk-21*` | **Not** the machine Java (17, left alone). A portable Temurin 21 lives in the ignored `.tools\` folder; `devtools\firebase.mjs` puts it on PATH for emulator commands only. To recreate it: download the Windows x64 JDK 21 zip from adoptium.net, verify its SHA-256, and unzip it into `.tools\`. |
| Expo Go on an Android phone | Play Store | Must support Expo SDK 58. Phone and PC on the same Wi-Fi. |
| Arduino CLI + ESP32 core 3.3.11 | `arduino-cli core list` | Shared with Dagitab. See CLAUDE.md before touching libraries. |

Install packages:

```powershell
cd devtools; npm install; cd ..
cd mobile;   npm install; cd ..
```

## Run the app against simulated data

Use three terminals.

**1. Emulators** (leave running; data is wiped when stopped):

```powershell
cd devtools; npm run emulators
```

Ready when it prints "All emulators ready". Emulator UI: http://127.0.0.1:4000. The first time, Windows Firewall may ask to allow Java; allow on **private** networks so the phone can connect.

**2. Seed, then simulate:**

```powershell
cd devtools; npm run seed; npm run simulate
```

`seed` creates the demo login (`demo@tubigtala.test` / `demo-pass-123`, emulator only), the simulated device `sim-01`, and 24 h of backfilled history. `simulate` sends a reading every 10 s. Stop it with Ctrl+C to watch the app show the device going stale (after 30 s), then offline (after 15 min).

**3. App:**

```powershell
cd mobile; npm start
```

Scan the QR code with Expo Go. The app finds the emulators on the PC's IP automatically (from the Metro bundler address). Override with `EXPO_PUBLIC_EMULATOR_HOST` in `mobile\.env` if needed.

**Google sign-in on the emulator:** "Continue with Google" signs in as a test account (`demo.google@tubigtala.test`) that the Auth emulator creates. It starts with no devices; give it the simulated device with `cd devtools; npm run assign -- demo.google@tubigtala.test` (and back with `demo@tubigtala.test`). Real Google accounts only work in an APK with a native Google sign-in library, which is not added yet.

## APK builds (GitHub Actions)

`.github/workflows/build-apk.yml`, manual only: GitHub > Actions > Build APK > Run workflow (or `gh workflow run build-apk.yml -f version=0.1.0`). The APK appears as a run artifact; tick "publish release" to also attach it to a GitHub Release. Free on this public repo.

It needs, in the GitHub repo settings (Secrets and variables > Actions):

| Kind | Name | Value |
|---|---|---|
| Secret | `ANDROID_DEBUG_KEYSTORE_BASE64` | base64 of `C:\App\tubigtala-keystore\debug.keystore` |
| Variable | `EXPO_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._APP_ID` | Web app config of `tubigtala-64d9e` (public values) |

The APK always uses the **real** project: an installed app cannot reach the emulators on this PC. The workflow refuses to build if the variables are missing or the project ID is not `tubigtala-64d9e`.

**Keystore:** `C:\App\tubigtala-keystore\debug.keystore` (outside the repo; never Dagitab's `C:\App\wattwise-keystore`). Android debug credentials (alias `androiddebugkey`, password `android`), fine for a sideloaded prototype, not for the Play Store. Back it up: if it is lost, new APKs will not install over old ones and the SHA-1 registered for Google sign-in changes. SHA-1 `69:2C:E1:DB:35:06:D4:D1:00:AB:EE:34:6A:87:EB:F2:0D:41:90:08`.

## Tests

```powershell
cd devtools; npm run test:rules     # Firestore Security Rules (starts and stops its own emulator)
cd mobile;   npm test               # status / formatting logic
```

## Firmware (compile only, no board needed)

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32 --build-path C:\App\TubigTala\.arduino-build firmware\tubigtala
```

Never use Dagitab's build folder. Before any **upload**: unplug Dagitab's Hub, run `arduino-cli board list`, confirm the port, and pass `--input-dir C:\App\TubigTala\.arduino-build`.

## Symptoms

| Symptom | Check |
|---|---|
| `firebase-tools no longer supports Java version before 21` | `.tools\jdk-21*` missing, or the command was run as plain `firebase` instead of through `npm run` in `devtools\`. |
| App stuck loading / network error on the phone | Emulators running? Phone on the same Wi-Fi? Firewall allowed Java on private networks? Try `EXPO_PUBLIC_EMULATOR_HOST=<PC IP>`. |
| Sign-in fails with "user not found" | Emulator data is wiped on restart. Run `npm run seed` again. |
| `simulate` prints `rejected: permission-denied` | Seed not run since the emulators started, or a reading field no longer matches `firestore.rules`. |
| Device shows "No readings yet" | The seed didn't run, or the app is signed in as a different user. |
