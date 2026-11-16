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

## 2. Create the station record (Firestore console)

The board is a **TubigTala Station**; `tank-01` is its ID, used only behind the scenes and on its sticker. It starts with **no owner**: whoever scans its QR sticker in the app pairs it (step 2b).

Firestore Database > **Data** > `devices` collection (Start collection if missing) > **Add document**, Document ID `tank-01`, fields:

| Field | Type | Value |
|---|---|---|
| `name` | string | `TubigTala Station` (fixed; the app cannot rename it) |
| `ownerUid` | **null** | must be present and null - the rules only let a station with `ownerUid` null be paired |
| `deviceUid` | string | the device UID from step 1.3 |
| `simulated` | boolean | `false` |
| `readingIntervalSec` | number | `60` (must match `READING_INTERVAL_MS` in `config.h`) |
| `phCalibration` | map | `status` (string) `uncalibrated`, `calibratedAt` (null), `method` (null) - the app fills in the rest when you calibrate |
| `createdAt` | timestamp | now |

## 2b. Pairing code and QR sticker

```powershell
cd devtools; npm run pair-code -- tank-01; cd ..
```

It prints a new random pairing code (e.g. `ABCD-EFGH-JKMN`) and writes `devtools\out\station-tank-01.html` (git-ignored - it holds the secret code).

1. Firestore console > **Start collection** `devicePairing` > Document ID `tank-01` > field `code` (string) = the code **without dashes**, as printed by the script. No app account can read this collection; the rules compare against it when someone pairs.
2. Open the HTML file in a browser, print it, and stick the label on the station's case. It shows the QR plus the ID and code for typing by hand.
3. App: **Settings > Add TubigTala Station** (or the button on the Water tab) > **Scan QR code**, or **Type the code**. The station then shows as "No readings yet" until the board sends its first reading.

**Remove station** (Settings) releases it: it disappears from that account and can be paired again with the same sticker. Its readings stay with the station, so a new owner sees the old history (accepted for this one-person prototype). To make an old sticker useless, run `pair-code` again and replace `code` in `devicePairing/tank-01`.

## 3. Fill in secrets.h

```powershell
Copy-Item firmware\tubigtala\secrets.example.h firmware\tubigtala\secrets.h
notepad firmware\tubigtala\secrets.h
```

- `WIFI_SSID` / `WIFI_PASSWORD`: **optional since firmware 0.4.0** - a **2.4 GHz** network (the ESP32 cannot see 5 GHz) to try first. Leave `WIFI_SSID` empty (`""`) for a station its owner will connect from a phone (step 6). A network chosen on the setup page is saved in the station and always wins over this one.
- `FIREBASE_API_KEY`: Firebase console > Project settings > General > **Web API key**.
- `DEVICE_ID`, `DEVICE_EMAIL`, `DEVICE_PASSWORD`: from steps 1 and 2.
- `SETUP_AP_PASSWORD`: written by step 3b - don't type one by hand.

## 3b. Wi-Fi setup sticker (firmware 0.4.0+)

```powershell
cd devtools; npm run setup-sticker -- tank-01 --write; cd ..
```

It makes a random 10-character password for the station's own **setup network** `TubigTala-Setup-tank-01`, writes it into `secrets.h` as `SETUP_AP_PASSWORD` (it refuses if `secrets.h` is for another station, and never prints the password), and writes the sticker `devtools\out\setup-wifi-tank-01.html` (git-ignored: it shows the password). Open it in a browser and print at 100% (5 x 1.5 in, the size of the other TubigTala stickers); its QR joins the setup network from a phone camera, and it also shows the network name and password for typing. Flash (step 4) **after** `--write`, so the station uses the new password. Without the `--write` flag it only remakes the sticker for the password already in `secrets.h`.

Without `SETUP_AP_PASSWORD` the setup network is **open**, and the home Wi-Fi password typed on the setup page crosses the air unencrypted - make the sticker.

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
TubigTala 0.4.0 boot 1a2b3c4d, DS18B20 count 1, pH UNCALIBRATED
[wifi] connecting to "YourWifi" (from secrets.h)
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
| `wifi` | Opens the Wi-Fi setup network now, like holding BOOT for 3 s (0.4.0+). |
| `forget` | Forgets the network saved by the setup page; the station goes back to `secrets.h`'s, or opens setup if there is none (0.4.0+). |

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
| G34 pin about 2500 mV in pH 7 buffer (board the same) | pH board is right (the 2.5 V offset set with the trimmer). Since firmware 0.3.1 pH has no divider (10 kΩ series only, ratio 1.0), so pin = board. |
| `CLIPPED` on G34 or G35 | Pin is near 3.3 V: divider missing, swapped (15k on top), or a board output above 5 V. Unplug and check before going on. |
| G34 or G35 near 0 mV | Signal wire not connected, or the board has no power (V+/VCC -> V5, G/GND -> GND). |
| Wi-Fi signal below about -80 dBm | Weak; uploads may fail. Move the board or the router closer. |

## 6. Wi-Fi setup from a phone (firmware 0.4.0+)

Anyone can connect the station to their own Wi-Fi - no PC, no re-flashing (`firmware/tubigtala/wifisetup.cpp`).

**When the setup network opens** - `TubigTala-Setup-<station id>`, WPA2 with the sticker's password, and the board's blue LED blinks:
- no network is known at all (nothing saved, `WIFI_SSID` empty);
- the known network has not worked **since this start** for 1 minute - a new place, a changed password;
- the **BOOT** button on the ESP32 board is held for 3 seconds (or serial `wifi`) - to change networks while online.

A station that was online and then loses its router does **not** open it: it keeps retrying, so a router restart never needs a phone. While no phone is on the setup network, the station also retries the known network every minute and closes setup as soon as that works (unless it was opened with BOOT / `wifi`, which stays until used or 10 minutes unused).

**Setting it up:**
1. Scan the Wi-Fi setup sticker with the phone camera (or join `TubigTala-Setup-<id>` and type the sticker's password). The phone may warn that the network has no internet - stay on it.
2. The setup page opens by itself (captive portal; otherwise open `http://192.168.4.1`). It lists nearby networks, strongest first.
3. Pick the home network, type its password, **Connect**. The station tries it for up to 20 s and saves it **only if it connects**; the page then shows **Connected!** (or "wrong password" / "network not found") and the setup network closes 30 s later.
4. Reconnect the phone to the usual Wi-Fi and pair in the app (step 2b) if not done yet.

The saved network lives in the station's flash (NVS namespace `wifi`), in plain text like `secrets.h`. Readings keep uploading while setup is open if the station is online; otherwise they queue (up to 60).

Tested on tank-01, 16 Nov 2026: BOOT held -> setup network on channel 11 with 7 networks listed; a phone joined by QR, a mistyped password showed "wrong password" after 20 s, the right one connected in 4 s, and the setup network closed 30 s later; uploads continued throughout.

## Troubleshooting

| Serial says | Likely cause | Check |
|---|---|---|
| `[wifi] not connected, retrying` forever | Wrong SSID/password, 5 GHz network, out of range | Set the network from a phone (step 6); move closer; use a 2.4 GHz network |
| No `TubigTala-Setup-…` network on the phone | Setup is not open: the station is online, or still within its first minute | Hold BOOT 3 s until the blue LED blinks (serial: `[wifi] … opening the setup network`) |
| Setup page does not open by itself | The phone's captive-portal check did not run | Open `http://192.168.4.1` in the phone's browser while on the setup network |
| Page: "wrong password" | Typo, or the network's password changed | Show password, type it again |
| Page: "network not found" | Name typed wrong, the network is 5 GHz only, or too far | Pick it from the list; a 2.4 GHz network; move the station closer |
| Page: "The station did not answer" | The phone left the setup network (it may hop to mobile data or another Wi-Fi) | Rejoin `TubigTala-Setup-…` and tap Connect again |
| `sign-in failed (HTTP 400)` | Wrong `DEVICE_EMAIL`/`DEVICE_PASSWORD`, or Email/Password sign-in disabled | Step 1; Authentication > Sign-in method |
| `sign-in failed (HTTP -1)` or upload `HTTP -1` | No internet, DNS, or TLS failure | Router internet; `google_roots.h` (Google root certs, valid to 2036) |
| `rejected by rules` | `devices/tank-01` missing, `deviceUid` is not this account's UID, `simulated` not `false`, or a value outside the allowed range | Step 2 field by field; `firestore.rules` |
| `queue full, dropping` | Offline for over an hour (60 readings) | Wi-Fi/internet; readings older than the queue are lost |
| `deviceTime` is `null` in readings | Clock not synced yet (NTP) | Normal for the first seconds after boot; the app uses server time anyway |

## Bench test without the cloud (optional)

With the emulators running on the PC (`cd devtools; npm run emulators; npm run seed`), uncomment `FIREBASE_EMULATOR_HOST` in `secrets.h` with the PC's LAN IP and use the seeded device account (`device-sim-01@tubigtala.test` / `device-pass-123`, `DEVICE_ID` `sim-01`). Uploads then go to the emulator over plain HTTP. The seeded `sim-01` device is `simulated: true`, so the rules reject real readings for it; for a bench test, change that field to `false` in the emulator UI (http://127.0.0.1:4000/firestore).
