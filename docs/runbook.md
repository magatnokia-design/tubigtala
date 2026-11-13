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
cd devtools;  npm install; cd ..
cd mobile;    npm install; cd ..
cd functions; npm install; npm run build; cd ..
```

The emulators also load the Cloud Functions from `functions\lib\`, so build them once (and again after changing `functions\src` or the shared `mobile\src\domain` files). Without a build the other emulators still run; the functions emulator reports an error and readings raise alerts only in the open app.

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

**What the app shows, in order:** sign in / create account -> "One more step" (any account without a PH mobile number, e.g. a new Google account) -> four onboarding slides (once per account per phone) -> Android notification prompt (once) -> the three tabs: Analytics, Water (start tab), Settings. Onboarding and the prompt are remembered on the phone (AsyncStorage, per account); clearing app data shows them again. Water and Analytics always show their cards, with "—" when there is no device or data.

**Google sign-in on the emulator:** "Continue with Google" signs in as a test account (`demo.google@tubigtala.test`) that the Auth emulator creates. It starts with no devices; give it the simulated device with `cd devtools; npm run assign -- demo.google@tubigtala.test` (and back with `demo@tubigtala.test`). Real Google accounts only work in an APK with a native Google sign-in library, which is not added yet.

## APK builds (GitHub Actions)

`.github/workflows/build-apk.yml` (**kept off the public repo since 9 Nov 2026**; it lives only on the dev PC. To build: copy it back into `.github/workflows/`, commit it on a branch merged to `main`, build, then remove it again), manual only: GitHub > Actions > Build APK > Run workflow (or `gh workflow run build-apk.yml -f version=0.1.0`). The APK appears as a run artifact; tick "publish release" to also attach it to a GitHub Release. Free on this public repo.

It needs, in the GitHub repo settings (Secrets and variables > Actions):

| Kind | Name | Value |
|---|---|---|
| Secret | `ANDROID_DEBUG_KEYSTORE_BASE64` | base64 of `C:\App\tubigtala-keystore\debug.keystore` |
| Variable | `EXPO_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._APP_ID` | Web app config of `tubigtala-64d9e` (public values) |

The APK always uses the **real** project: an installed app cannot reach the emulators on this PC. The workflow refuses to build if the variables are missing or the project ID is not `tubigtala-64d9e`.

**Keystore:** `C:\App\tubigtala-keystore\debug.keystore` (outside the repo; never Dagitab's `C:\App\wattwise-keystore`). Android debug credentials (alias `androiddebugkey`, password `android`), fine for a sideloaded prototype, not for the Play Store. Back it up: if it is lost, new APKs will not install over old ones and the SHA-1 registered for Google sign-in changes. SHA-1 `69:2C:E1:DB:35:06:D4:D1:00:AB:EE:34:6A:87:EB:F2:0D:41:90:08`.

**See an alert:** with the app open on the Water tab, stop the simulator (Ctrl+C) and run `npm run simulate -- --alert=ph` (or `temp`, `nh3`). The first 12 readings (~2 min) are critical: the card turns red, the bell count goes up, and in the installed APK a phone notification appears. Then values return to normal.

**Expo Go limits:** Expo Go on Android (SDK 58) cannot load `expo-notifications`, so the permission prompt and phone notifications only work in the APK; in Expo Go the switch says "Works in the installed app". Google sign-in with real accounts also needs the APK.

## Tests

```powershell
cd devtools;  npm run test:rules     # Firestore Security Rules (starts and stops its own emulator)
cd mobile;    npm test               # status / formatting / alert logic
cd functions; npm test               # SMS policy: caps, streak, message text
cd functions; npm run test:e2e       # builds, starts auth+firestore+functions emulators, uploads readings, checks alerts/SMS records
```

## Cloud Functions (alert backend)

`functions\` holds the backend that raises alerts and sends SMS for every uploaded reading (`onReadingCreated`, region `asia-southeast1`; policy in `docs/data-model.md`, "Alert policy"). It compiles the app's `mobile\src\domain\{thresholds,alerts,format}.ts` into its own build, so the app and the server classify and word alerts with the same code.

Status (13 Nov 2026): runs on the emulator only. Deploying needs the Blaze plan. SMS goes to a **log provider** that prints what would be sent (recipient masked) and sends nothing; the real TextBee sender, server push, and offline checks are not built yet. Email alerts were dropped on 13 Nov 2026 (phone notifications + SMS only).

**Deploy caution.** Now that `firebase.json` has a `functions` section, a plain `firebase deploy` also tries to deploy functions (and fails on Spark). Deploy rules on their own:

```powershell
firebase use                                # must print tubigtala-64d9e
firebase deploy --only firestore:rules
```

## Firmware (compile only, no board needed)

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32 --build-path C:\App\TubigTala\.arduino-build firmware\tubigtala
```

Never use Dagitab's build folder. Before any **upload**: unplug Dagitab's Hub, run `arduino-cli board list`, confirm the port, and pass `--input-dir C:\App\TubigTala\.arduino-build`.

## Landing page (website/) and APK downloads

`website/` is a static landing page (React + Vite, no login, no data) that describes the app and links to the APK. It imports the app's design tokens (`mobile/src/constants/tokens.ts`) and logos (`mobile/assets/brand/`), so a colour changed there changes both.

```powershell
cd website; npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build to website\dist
```

**Hosting: Vercel** (the user's account, connected once in the dashboard): Add New > Project > import `magatnokia-design/tubigtala` > **Root Directory `website`** (framework Vite, defaults). Keep "Include files outside the root directory in the Build Step" on - the site reads `../mobile`. Every merge to `main` redeploys.

**APK download:** the button links to `https://github.com/magatnokia-design/tubigtala/releases/latest/download/TubigTala.apk`. Every GitHub Release must therefore carry the APK under the fixed name **`TubigTala.apk`** (plus a versioned copy), and be marked latest:

```powershell
gh release create v0.9.0 TubigTala.apk TubigTala-v0.9.0.apk --target <commit the APK was built from> --title "TubigTala 0.9.0" --notes-file notes.md --latest
```

Then update `APP_VERSION` in `website/src/content.ts`. v0.8.0 published 13 Nov 2026 (built from `b6d8a32`). The APK is too big (65 MB) to host on Vercel itself.

## Symptoms

| Symptom | Check |
|---|---|
| `firebase-tools no longer supports Java version before 21` | `.tools\jdk-21*` missing, or the command was run as plain `firebase` instead of through `npm run` in `devtools\`. |
| App stuck loading / network error on the phone | Emulators running? Phone on the same Wi-Fi? Firewall allowed Java on private networks? Try `EXPO_PUBLIC_EMULATOR_HOST=<PC IP>`. |
| Sign-in fails with "user not found" | Emulator data is wiped on restart. Run `npm run seed` again. |
| `simulate` prints `rejected: permission-denied` | Seed not run since the emulators started, or a reading field no longer matches `firestore.rules`. |
| Device shows "No readings yet" | The seed didn't run, or the app is signed in as a different user. |
