# Setting up a TubigTala device

From a bare ESP32 to readings in the app. Do the wiring and calibration in `docs/wiring.md` first. Commands are PowerShell from `C:\App\TubigTala`.

Status (4 Nov 2026): firmware 0.2.2 compiles; **never run on a board yet**. Every step below that touches hardware is untested until then.

## 1. Give the device its own login (Firebase console)

Each board signs in as its own Firebase Auth account. That account can only write readings for its one device, so a leaked password exposes one device, not the project.

1. Firebase console > **tubigtala** > Build > **Authentication** > Sign-in method: **Email/Password** must be enabled.
2. Authentication > **Users** > **Add user**:
   - Email: `tank-01@devices.tubigtala.app` (any address; it never receives mail)
   - Password: a long random one (e.g. from a password manager)
3. Copy the new user's **User UID**. This is the *device* UID.
4. In the same list, find **your own** account (the one you sign in to the app with) and copy its User UID. This is the *owner* UID.

## 2. Create the device record (Firestore console)

Firestore Database > **Data** > `devices` collection (Start collection if missing) > **Add document**, Document ID `tank-01`, fields:

| Field | Type | Value |
|---|---|---|
| `name` | string | `Tank 1` (shown in the app; you can rename later) |
| `ownerUid` | string | your owner UID from step 1.4 |
| `deviceUid` | string | the device UID from step 1.3 |
| `simulated` | boolean | `false` |
| `readingIntervalSec` | number | `60` (must match `READING_INTERVAL_MS` in `config.h`) |
| `phCalibration` | map | `status` (string) `uncalibrated`, `calibratedAt` (null), `method` (null) - the app fills in the rest when you calibrate |
| `createdAt` | timestamp | now |

The device now appears in the app as "No readings yet" until the board sends its first reading.

## 3. Fill in secrets.h

```powershell
Copy-Item firmware\tubigtala\secrets.example.h firmware\tubigtala\secrets.h
notepad firmware\tubigtala\secrets.h
```

- `WIFI_SSID` / `WIFI_PASSWORD`: a **2.4 GHz** network (the ESP32 cannot see 5 GHz).
- `FIREBASE_API_KEY`: Firebase console > Project settings > General > **Web API key**.
- `DEVICE_ID`, `DEVICE_EMAIL`, `DEVICE_PASSWORD`: from steps 1 and 2.

`secrets.h` is git-ignored; never commit it. Check with `git status` before any commit.

## 4. Flash (Dagitab's Hub is also an ESP32)

1. **Unplug Dagitab's Hub.** Flashing the wrong port overwrites its firmware.
2. Plug in the TubigTala board and find its port:
   ```powershell
   arduino-cli board list
   ```
   Confirm exactly one ESP32 port is listed, e.g. `COM5`.
3. Compile and upload with this project's build folder (never `C:\App\WattWise\.arduino-build`):
   ```powershell
   arduino-cli compile --fqbn esp32:esp32:esp32 --build-path C:\App\TubigTala\.arduino-build firmware\tubigtala
   arduino-cli upload  --fqbn esp32:esp32:esp32 --input-dir C:\App\TubigTala\.arduino-build -p COM5 firmware\tubigtala
   ```

## 5. Watch it work (serial)

Opening the serial port resets the board; that is expected here.

```powershell
arduino-cli monitor -p COM5 -c baudrate=115200
```

Expected, in order:

```
TubigTala 0.2.2 boot 1a2b3c4d, DS18B20 count 1, pH UNCALIBRATED
Device tank-01, Wi-Fi "YourWifi", uploading to tubigtala-64d9e
Type help for commands
READING {"bootId":"1a2b3c4d","seq":0,...}
[cloud] signed in
[cloud] saved #0 (0 waiting)
```

Then the reading appears in the app's Water tab within a few seconds. Next, calibrate pH from the app (`docs/wiring.md`, Calibration); serial shows `[cloud] pH calibration applied` within 10 minutes.

### Serial commands (firmware 0.2.1+)

Type into the monitor and press Enter (Arduino IDE Serial Monitor: set the line ending to "Newline"). They only read and print, except `read`. Readings and uploads keep running meanwhile. Use these instead of re-flashing to check wiring.

| Command | What it does |
|---|---|
| `help` | Lists the commands. |
| `diag` | One report: Wi-Fi (signal in dBm), clock, upload queue, pH calibration in use, DS18B20 (temperature, or why not), G34 and G35 (pin mV, board output mV, pH estimate). |
| `read` | Takes a normal reading now (it is uploaded like any other) and restarts the 1-minute timer. |
| `pins` | Prints G34 (pH) and G35 (gas) every second for 30 s. Use it while turning the pH board's trimmer. `stop` ends it early. |

Example `diag` (values illustrative, not measured):

```
--- diag: TubigTala 0.2.2, boot 1a2b3c4d, up 95 s
Wi-Fi:  connected to "YourWifi", signal -58 dBm, IP 192.168.1.40
Clock:  2026-11-04 15:42:10 (UTC+8)
Queue:  0 reading(s) waiting to upload
pH cal: NOMINAL - not calibrated (pH 7.00 = 2500 mV, pH 4.00 = 3040 mV)
Temp:   27.44 C (1 probe(s) found)
pH:     G34 pin 1502 mV -> board 2503 mV -> pH 6.98 (uncalibrated)
Gas:    G35 pin  410 mV -> board  683 mV (heater warming up, 85 s left)
---
```

What the lines tell you:

| You see | Meaning |
|---|---|
| `DS18B20 NOT FOUND` | Probe not wired: DAT->G4, VCC->3V3, GND, or a loose wire in the green screw terminal. |
| `85.00 C is the power-on value` | Normal right after power-on; run `diag` again. |
| G34 pin about 1500 mV in pH 7 buffer (board about 2500 mV) | pH board and divider are right (the 2.5 V offset set with the trimmer, x 0.6). |
| `CLIPPED` on G34 or G35 | Pin is near 3.3 V: divider missing, swapped (15k on top), or a board output above 5 V. Unplug and check before going on. |
| G34 or G35 near 0 mV | Signal wire not connected, or the board has no power (V+/VCC -> V5, G/GND -> GND). |
| Wi-Fi signal below about -80 dBm | Weak; uploads may fail. Move the board or the router closer. |

## Troubleshooting

| Serial says | Likely cause | Check |
|---|---|---|
| `[wifi] not connected, retrying` forever | Wrong SSID/password, 5 GHz network, out of range | `secrets.h`; move closer; use a 2.4 GHz network |
| `sign-in failed (HTTP 400)` | Wrong `DEVICE_EMAIL`/`DEVICE_PASSWORD`, or Email/Password sign-in disabled | Step 1; Authentication > Sign-in method |
| `sign-in failed (HTTP -1)` or upload `HTTP -1` | No internet, DNS, or TLS failure | Router internet; `google_roots.h` (Google root certs, valid to 2036) |
| `rejected by rules` | `devices/tank-01` missing, `deviceUid` is not this account's UID, `simulated` not `false`, or a value outside the allowed range | Step 2 field by field; `firestore.rules` |
| `queue full, dropping` | Offline for over an hour (60 readings) | Wi-Fi/internet; readings older than the queue are lost |
| `deviceTime` is `null` in readings | Clock not synced yet (NTP) | Normal for the first seconds after boot; the app uses server time anyway |

## Bench test without the cloud (optional)

With the emulators running on the PC (`cd devtools; npm run emulators; npm run seed`), uncomment `FIREBASE_EMULATOR_HOST` in `secrets.h` with the PC's LAN IP and use the seeded device account (`device-sim-01@tubigtala.test` / `device-pass-123`, `DEVICE_ID` `sim-01`). Uploads then go to the emulator over plain HTTP. The seeded `sim-01` device is `simulated: true`, so the rules reject real readings for it; for a bench test, change that field to `false` in the emulator UI (http://127.0.0.1:4000/firestore).
