# Data model

The one definition of what TubigTala stores and what each value means. Firmware (`firmware/`), Security Rules (`firestore.rules`), the simulator (`devtools/`), and the mobile app (`mobile/`) must all agree with this file. If you change a field here, search all four for it.

Status: **draft, 24 Oct 2026.** No real hardware has produced a reading yet; every reading so far is simulated.

## Collections

```
users/{uid}                                  one app account's profile and alert preferences
users/{uid}/notifications/{notificationId}   alerts for that account
users/{uid}/alertState/{deviceId}_{metric}   last status per device and field (alert de-duplication; also the missing-value episode)
users/{uid}/alertState/{deviceId}_offline    whether the station is offline (server-only, written by the station check)
users/{uid}/pushTokens/{id}   one per phone with phone notifications on: { token, platform, appVersion, updatedAt } (since 16 Nov 2026)
devices/{deviceId}                           one monitoring unit (ESP32 + probes)
devices/{deviceId}/readings/{readingId}      one sample from that unit
```

Server-only (written by Cloud Functions with firebase-admin; no app account can read or write them, tested in `devtools/rules.test.mjs`):

```
alertDeliveries/{id}   one SMS: sms_{uid}_{deviceId}_{metric}_{alertedAtMs}; one push: push_{uid}_{alertId} (email_… records may exist from before 13 Nov 2026)
smsBudget/global       SMS counted per Philippine day and month, for the caps
devicePairing/{deviceId}  { code }: the station's secret pairing code, set by an admin (devtools pair-code); only the rules read it
pushTokenOwners/{tokenId}  { uid, updatedAt }: which account a phone registered with last (onPushTokenWritten); closed to the app by the rules' default deny
```

`alertDeliveries` fields: `channel` (`sms` or `push`; `email` only in records from before 13 Nov 2026), `uid`, `deviceId`, `readingId`, `metric`, `status` (`sending` → `sent`/`failed`, or `skipped: day|month cap reached` / `skipped: no phone registered`), `detail` (provider outcome, no secrets or recipients), `createdAt`, `updatedAt`. The record is created **before** sending; a second run for the same reading or episode finds it and sends nothing. `smsBudget/global`: `{ day: "2026-11-04", dayCount, month: "2026-11", monthCount }`.

### `users/{uid}`

Created at sign-up (email) or on the "Complete your profile" screen (Google). The app treats an account as ready only when this document exists **and** `phoneE164` is set; until then it shows that screen.

| Field | Type | Meaning |
|---|---|---|
| `displayName` | string | 1–60 characters. |
| `phoneE164` | string \| null | Philippine mobile number, `+639XXXXXXXXX` (pattern enforced by rules and `mobile/src/domain/phone.ts`). Personal data: never log it. |
| `smsAlertsEnabled` | boolean | User wants SMS alerts. Cannot be `true` while `phoneE164` is `null`. Set to `true` whenever the app saves a number (sign-up, complete profile, editing the number); the user can switch it off. The backend sends SMS only while it is on (checked at send time; tested in `functions/src/readings.e2e.ts`). |
| `pushEnabled` | boolean | User allowed app notifications and Android granted the permission. The app asks once per account per phone on first entry (after onboarding), then only via the Settings switch. While it is on, the backend sends one phone notification per alert to the phones in `pushTokens` (app 0.9.2+); switching it off removes this phone's token. |
| `createdAt` | timestamp | Server time at creation, never changed. |
| `updatedAt` | timestamp | Server time of the last write (rules require `== request.time`). |

Only the owner can read or write it; it cannot be deleted from the app. Email lives in Firebase Auth, not here.

### `users/{uid}/notifications/{notificationId}`

Alerts. **Only the backend raises them** (`functions/src/readings.ts` for every reading, `stations.ts` for offline), with the decision in `mobile/src/domain/alerts.ts`: one alert when a field's status gets worse (normal → warning → critical, per `mobile/src/domain/thresholds.ts` against the station's alert limits, see "Alert ranges"). Until app 0.9.4 the open app raised them too, through the same `alertState` transaction and alert ID; that was removed, and the rules no longer let any app write alerts or `alertState`, so an older app with the default limits built in cannot raise alerts the station's own limits would not. Within 30 minutes of an alert, the same or a lower level does not alert again (a value bouncing across a limit); a worse level always does. Wording (`alertText` in `mobile/src/domain/alerts.ts`, final since 0.9.5): the title names the device, what is wrong in plain words and the reading, so a locked phone alone says it all - "TubigTala Station: water too acidic (pH 5.8)", "…: water too hot (36.2 °C)", "…: ammonia gas a bit high (1844 mV)"; the body gives the value and normal range, e.g. "pH is 5.8. Normal is 6.5 to 8.5. Lower pH means more acidic." (pH adds which way it is; gas adds "A relative reading, not ppm."), then caveats last: uncalibrated pH adds "The pH sensor is not calibrated yet, so this may be off.", simulated data adds "Test data, not a real sensor." The in-app list shows "Water too acidic" with "pH 5.8 · normal 6.5 to 8.5"; an out-of-range pH alert's details add what it can mean, in the US EPA's words for its 6.5–8.5 range (a taste-and-pipes guide, not a health limit): "Acidic water can taste metallic and corrode pipes." / "Alkaline water can taste like soda and leave mineral deposits." Alerts stored before 0.9.5 keep their old title and body. Fields: `title` (≤80), `body` (≤200), `deviceId`, `metric` (`ph`/`temperatureC`/`nh3GasMv`), `value` (number|null), `level` (`warning`/`critical`), `limits` (since 0.9.4: the field's limits it was checked against, same shape as one sensor of `devices/{id}.limits`; absent in older alerts, which were all checked against the defaults), `readingId`, `createdAt` (server time), `read` (false on create). The app shows an alert's status word and normal range from its own `limits`, so changing the station's limits later does not turn an old alert into "Normal".

The document ID is `{deviceId}_{metric}_{readingId}`. The owner may mark alerts read and delete them; only the backend creates them.

**Station health alerts** (since 16 Nov 2026, backend only, push only - never SMS) have `metric: null`, so every app version shows their `title` and `body` as written, plus a `kind`:

| `kind` | When | ID | Example |
|---|---|---|---|
| `sensor` (+ `sensor`: the field) | a field has had no value for 10 minutes (`SENSOR_MISSING_MS`, `functions/src/health.ts`) - longer than the gas sensor's 3-minute warm-up, so a restart never alerts; one per episode | `{deviceId}_{metric}_missing_{readingId}` | "TubigTala Station: temperature sensor not reading" / "No temperature value since 4:21 PM. Check the temperature probe and its wires." |
| `offline` | no reading for 15 minutes - the app's own Offline rule (`mobile/src/domain/status.ts`), checked every 5 minutes by `checkStations` | `{deviceId}_offline_{lastReadingId}` | "TubigTala Station: offline" / "No readings since 4:10 PM. Check its power and Wi-Fi." |
| `online` | readings again after an `offline` alert (`level` null) | `{deviceId}_online_{newestReadingId}` | "TubigTala Station: back online" / "Readings resumed at 4:52 PM. The last one before that was at 4:10 PM." |

Value alerts have no `kind`.

### `users/{uid}/alertState/{deviceId}_{metric}`

One per device and field, so one ongoing condition raises one alert. Written only by the backend (since 0.9.4; the owner can read it), in the same Firestore transaction as the alert: if the alert fails, the state is unchanged and the next reading tries again.

| Field | Type | Meaning |
|---|---|---|
| `level` | `normal` | `warning` | `critical` | Last status seen. |
| `alertLevel` | `warning` | `critical` | null | Level of the last alert raised. |
| `alertedAt` | timestamp | null | When that alert was raised (cooldown). |
| `updatedAt` | timestamp | Server time of the write. |
| `missingSince` | timestamp (absent when the field has a value) | Server only: time of the first reading in the current run without a value for this field. Deleted by the next reading that has one. |
| `missingAlertedAt` | timestamp (absent) | Server only: when "sensor not reading" was raised for this run (one per run). |

When the owner changes the station's limits, the next reading is classified with the new ones and compared with the stored `level`: a reading that is now worse raises an alert at once, one that is now normal just updates the state.

`users/{uid}/alertState/{deviceId}_offline` (server only, `functions/src/stations.ts`): `{ offline: boolean, lastReadingAt: timestamp, changedAt: timestamp }` - the station's state at the last change, so offline and back online are each announced once.

### `users/{uid}/pushTokens/{id}` (since 16 Nov 2026, app 0.9.2)

Where the backend sends phone notifications: one document per phone while Settings > Phone notifications is on. The app registers on start and when Firebase replaces the token; it deletes the document when notifications are switched off and on sign-out. The backend deletes tokens Firebase Cloud Messaging reports as gone. Only the owner can read or write them (tested in `devtools/rules.test.mjs`).

| Field | Type | Meaning |
|---|---|---|
| `token` | string, 20–4096 chars | The phone's Firebase Cloud Messaging registration token. |
| `platform` | `android` | Only Android is built. |
| `appVersion` | string | App version that registered it (troubleshooting). |
| `updatedAt` | timestamp | Server time of the write. |

The document ID is a short hash of the token (`mobile/src/domain/push.ts`), so the same phone always maps to the same document - under every account.

**A phone belongs to the account that registered it last** (since 16 Nov 2026, `functions/src/push-owners.ts`). A sign-out right after the app opens can lose a race with the background registration and leave the phone on the old account too (seen when the owner switched from the station's login to a personal account), and every account it is left on would push its alerts to that phone. So the trigger `onPushTokenWritten` records each phone's account in `pushTokenOwners/{tokenId}` and, when the same phone registers on another account, deletes it from the previous one. Safe because an account can only write while signed in and the next one only signs in after it signed out, so the server sees one phone's registrations in the order the accounts were used. Tested in `functions/src/readings.e2e.ts`.

Owner only. Each phone touches this record only when a field's status changes, not on every reading, to keep Firestore reads low. Verified on the emulator (28 Oct 2026): two phones racing on the same reading produce one alert; the loser gets `permission-denied` and does nothing on its next try.

### Alert ranges

Water type: **fresh / tap water** (decided 4 Nov 2026). `mobile/src/domain/thresholds.ts` is the only definition of the rule and of the **default** limits below. Since app 0.9.4 a station's owner can set the station's own limits per sensor (Settings > Station > Alert limits, `devices/{id}.limits`), which then apply everywhere instead: Water cards and scales, Analytics, the alerts the server raises, SMS and exports. Stations without them use the defaults:

| Field | Normal | Warning | Critical | Status words (cards and alert titles) |
|---|---|---|---|---|
| pH | 6.5–8.5 | 6.0–6.5 / 8.5–9.0 | below 6.0 / above 9.0 | A bit acidic, Too acidic / A bit alkaline, Too alkaline |
| Temperature | 20–32 °C | 15–20 / 32–35 °C | below 15 / above 35 °C | A bit cold, Too cold / A bit warm, Too hot |
| Ammonia gas | up to 1700 mV | 1701–2200 mV | above 2200 mV | A bit high, Too high |

pH 6.5–8.5 is the usual drinking-water guideline range. Temperature has no safety limit for tap water; its range only flags unusual water. **Ammonia gas ranges** come from tank-01's clean-air baseline (7 Nov 2026, 10 min of `pins` in the enclosure above tap water, after burn-in): mean 1396 mV, p95 1461, max 1505 (module output). Normal leaves ~300 mV above the baseline; they are relative to this sensor, not ppm. Re-record the baseline if the sensor or enclosure changes, and adjust. Status words are everyday words for what is happening: for pH the usual tap-water words, below 7 acidic and above 7 alkaline (since 0.9.5; before that "too low / too high", which did not say what a high pH means; "basic" was avoided because "too basic" reads like "too simple"). SMS puts the reading next to what was measured: "TubigTala: TubigTala Station pH 5.8 TOO ACIDIC (normal 6.5-8.5) at 3:42 PM".

**Gas sensor warm-up** (since 0.9.5, `mobile/src/domain/warmup.ts`, one rule for the app and the server): each reading's `seq` counts readings since power-on, so `seq` × `readingIntervalSec` = how long the station had been on. The MQ-137's heater needs time: the firmware sends no gas value for 3 minutes (`NH3_WARMUP_MS`), and the values then start high and drift down - the longer the station was off, the longer (tank-01: off 8 minutes, 16 Nov: 1844 mV at 4 minutes, under 1700 by 12; off 13 hours, 17 Nov: 2552 at 4 minutes, 1746 at 15, about 1700 by 20; off 6 days, 13 Nov: 1730 at 28 minutes, under 1700 at 48; after a short restart normal straight away). For the first **30 minutes** (`GAS_SETTLE_MS`; 15 in 0.9.5, which let the 13-hour case raise "a bit high (1746 mV)" the minute it ended) the Water card shows "Warming up" with a progress bar and the server raises **no gas alert** and no gas "sensor not reading" (it used to raise "ammonia gas a bit high" after every power-on). After several days off one "a bit high" warning can still follow the warm-up (gas never sends SMS). A broken gas sensor reports "not reading" after 40 minutes instead of 10. Simulated devices have no warm-up. The first reading after power-on that lacks a value shows "Starting up" instead of "No reading".

### Alert policy: phone notifications and SMS

Decided 4 Nov 2026; **email dropped 13 Nov 2026** (the user chose phone notifications + SMS only; no Brevo, no sender domain needed). **Built for reading alerts in `functions/`, tested on the emulator; Blaze enabled 16 Nov 2026.** Deployed, SMS goes out through TextBee (secrets `TEXTBEE_API_KEY` / `TEXTBEE_DEVICE_ID`) - first real SMS delivered 16 Nov 2026 15:33 - and phone notifications go out through **Firebase Cloud Messaging** straight from the function (decided 16 Nov 2026 instead of the Expo push service: no extra account or key) to the phones in `users/{uid}/pushTokens`, one push per alert, so they arrive while the app is closed (first one delivered 16 Nov 2026 16:25 with the app closed, 2 s after the reading; the SMS followed on the 3rd hot reading); the app no longer shows its own pop-up for alerts (it would show each twice). In the emulator both are only logged. Station health alerts (sensor not reading, offline, back online - see the notifications section) were added 16 Nov 2026: push only. Not built yet: the "SMS limit reached" notice in the app. The board never sends alerts; the function `onReadingCreated` evaluates each uploaded reading with the app's own `domain/thresholds.ts` and `domain/alerts.ts`, against the station's alert limits (`domain/limits.ts`; the defaults unless the owner set its own); since app 0.9.4 it is the only thing that raises alerts. An SMS "episode" is one critical alert: the SMS goes out on the 3rd critical reading in a row and not again until a new critical alert is raised (after recovery and the 30-minute cooldown). Simulated devices never get SMS. SMS is scarce (TextBee plan: 300/month), so it is kept for critical pH and temperature only.

| Event | Push | SMS |
|---|---|---|
| pH or temperature warning | yes | no |
| pH or temperature critical | yes | yes, after 3 critical readings in a row; pH only when calibrated |
| Ammonia gas warning or critical | yes | no (relative reading, not ppm - SMS kept for pH and temperature) |
| A sensor sends no value for 10 min (gas: after warm-up) | yes | no |
| Device offline (no reading for 15 min - the app's Offline rule) / back online | yes | no |
| SMS monthly limit reached | yes | no |

SMS rules: one SMS per ongoing condition (same cooldown as above); conditions on the same device within a few minutes go in one SMS; at most 5 per day and 100 per month across all devices (TextBee free plan: 50/day and 300/month for the whole account, received SMS included, shared with Smilebook), counted per recipient; past a cap, alerts still go by push and the app shows that the SMS limit was reached. SMS text uses no symbols such as "°" (they switch the SMS to a format that fits fewer than half as many characters), e.g. `TubigTala: Tank 1 pH TOO HIGH 9.4 (normal 6.5-8.5) at 3:42 PM`. Check how TextBee counts multi-part SMS against the 300 before building. The TextBee account and phone are also used by another project (Smilebook), which counts against the same monthly limit - lower `SMS_MONTH_CAP` (`functions/src/policy.ts`) by what that project sends.

### `devices/{deviceId}`

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Product name shown in the app: `TubigTala Station`. Set when provisioned; the app cannot change it. |
| `ownerUid` | string \| null | Firebase Auth uid of the user who may view this station; **null** = not paired (must be present). Set by pairing, cleared by Remove station. |
| `pairCode` | string | Present while paired: the code the owner paired with (equal to `devicePairing/{deviceId}.code` at that time). Removed on unpair. |
| `pairedAt` | timestamp \| null | Server time of pairing; null when not paired. |
| `deviceUid` | string | Firebase Auth uid the ESP32 signs in as. Only this account may write readings. Never the same as `ownerUid`. |
| `simulated` | boolean | `true` for the `devtools/` simulator. Readings from a simulated device must carry `simulated: true` (enforced by rules). |
| `readingIntervalSec` | number | How often the device is expected to send a reading. Drives stale/offline status. Default 60. |
| `phCalibration` | map | `{ status: "uncalibrated" \| "calibrated", calibratedAt: timestamp \| null, method: string \| null, ph7Mv?: number, ph4Mv?: number, ph7BufferPh?: number, ph4BufferPh?: number }`. Saved by the app's Calibrate pH screen (owner only; buffers 100–1500 mV apart; `calibratedAt` = server time). `ph7Mv`/`ph4Mv`: module output in the neutral / acid buffer, mV. `ph7BufferPh`/`ph4BufferPh`: those buffers' true pH, 6.5–7.5 and 3.5–4.5 (e.g. 6.86 / 4.01); absent in calibrations saved before 4 Nov 2026, which means 7.00 / 4.00. pH = `ph7BufferPh + (mV − ph7Mv) × (ph7BufferPh − ph4BufferPh) / (ph7Mv − ph4Mv)`, identical in `mobile/src/domain/calibration.ts` and the firmware. The board reads the record at start and every 10 min, applies it and keeps a copy in flash. The per-reading `phCalibrated` flag records which was in use; stored readings are not recalculated. |
| `limits` | map (absent = the default limits) | Since 0.9.4: the owner's alert limits, `{ ph, temperatureC, nh3GasMv, updatedAt }`, each sensor `{ normalMin, normalMax, criticalBelow, criticalAbove }` in the reading's unit: normal is `normalMin`..`normalMax` (inclusive), critical is below `criticalBelow` or above `criticalAbove`, in between is a warning. Rules (and `mobile/src/domain/limits.ts`, used by the app and the server alike): all three sensors, numbers within what the sensor can report (pH 0–14, temperature −10–125 °C, gas 0–5500 mV), `criticalBelow ≤ normalMin < normalMax ≤ criticalAbove`, gas `normalMin` and `criticalBelow` 0 (high side only), `updatedAt` = server time. Saving the defaults removes the field. A sensor with missing or invalid limits (e.g. edited by hand) uses its defaults. They stay with the station when it is removed, like `phCalibration`. The firmware ignores the field (it keeps only `phCalibration` from the record). |
| `createdAt` | timestamp | Server time. |

Clients cannot create or delete devices. They are provisioned by an admin with `ownerUid: null` (Firebase console, `docs/device-setup.md`; `devtools/` on the emulator). **Pairing:** a signed-in user may set `ownerUid` to themselves, `pairedAt` to server time and `pairCode` to the code from the station's QR sticker - only while `ownerUid` is null and only if `pairCode` equals `devicePairing/{deviceId}.code` (format in `mobile/src/domain/pairing.ts`: 12 characters from an alphabet without 0/O/1/I/L; QR text `tubigtala:station?id=<id>&code=XXXX-XXXX-XXXX`). A wrong code, an unknown ID and a station someone else owns are indistinguishable to the app. **Remove:** the owner may set `ownerUid` and `pairedAt` to null and delete `pairCode`; readings stay with the station. Otherwise the owner may change only `phCalibration` and `limits` (each on its own). The board (its `deviceUid` account) may read its own device record, to pick up its calibration.

### `devices/{deviceId}/readings/{readingId}`

`readingId` = `{bootId}-{seq}`. Re-sending the same reading after a network error targets the same ID; the second write is rejected because readings can only be **created**, never updated. Firmware treats "already exists" as success. That is the duplicate-upload guard.

| Field | Type | Unit / range | Meaning |
|---|---|---|---|
| `bootId` | string | 4–32 chars | Random ID chosen at each ESP32 boot. |
| `seq` | int | ≥ 0 | Counter since boot. |
| `serverTime` | timestamp | — | Set with `serverTimestamp()`; rules require it to equal the request time. **This is the clock all status logic uses.** |
| `deviceTime` | timestamp \| null | — | From NTP on the ESP32. `null` if the clock was not synced. Display only, never trusted for ordering. |
| `ph` | number \| null | pH, 0–14 | `null` = no valid reading (probe missing, out of range). |
| `phCalibrated` | boolean | — | `false` means `ph` was computed from nominal constants, not a buffer calibration. The app must say so. |
| `phMv` | number \| null | mV, 0–5500 | pH module output voltage (after undoing the divider; none on pH since firmware 0.3.1). Since 0.3.2 the **average of 1-second samples over the reading interval** (null when most samples had no value). Kept so readings can be recalculated after calibration. |
| `temperatureC` | number \| null | °C, −10–125 | DS18B20 water temperature. `null` when disconnected (`-127`), the power-on value (`85.0`), or outside −10–125 °C (`TEMP_MIN_C`/`TEMP_MAX_C`; 125 is the sensor's own limit). Firmware up to 0.3.2 (and rules before 16 Nov 2026) stopped at 60 °C, so hotter test water uploaded as no value and raised no alert; 0.3.3 reports it, and it shows as "Too hot". |
| `nh3GasMv` | number \| null | mV, 0–5500 | MQ-137 module analog output voltage (after undoing the divider); since firmware 0.3.2 the average of 1-second samples over the reading interval. **Ammonia gas in air above the water, uncalibrated.** Not ppm, not dissolved ammonia. Higher = more gas, relative only. |
| `simulated` | boolean | — | `true` = generated by the simulator, not a sensor. |
| `firmware` | string | 1–32 chars | Firmware or simulator version string. |

Every reading field is required, but sensor values may be `null`. **`null` is not `0`.** A missing sensor is `null`; the app shows "—", never 0.

## Device status (one rule, used everywhere)

Based on the newest reading's `serverTime` compared to now, with `interval = readingIntervalSec`:

| Status | Condition | App shows |
|---|---|---|
| `no-data` | the device has no readings at all | "No readings yet" |
| `live` | age ≤ 3 × interval | values normally |
| `stale` | 3 × interval < age ≤ 15 min | values greyed, "Last update X min ago" |
| `offline` | age > 15 min | "Offline since …", values greyed |

Implemented once in `mobile/src/domain/status.ts`. When Cloud Functions exist, move it to shared code instead of copying it.

## Access rules (summary)

Enforced in `firestore.rules`, tested in `devtools/rules.test.mjs`.

- A user can read and write only their own `users/{uid}` profile (valid fields only); read, mark read and delete their own notifications; and read their own `alertState`. Alerts and `alertState` are written only by the backend (since 0.9.4).
- The owner of a station can save its pH calibration and its alert limits (valid values only), pair and remove it - nothing else on the device record.
- A user can read a device, and its readings, only if they are its `ownerUid`.
- Only the device's `deviceUid` can create readings, and only well-formed ones (types, ranges, `serverTime == request.time`, `simulated` matches the device).
- Nobody can update or delete readings from a client.
- Anything not listed is denied.
