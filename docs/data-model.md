# Data model

The one definition of what TubigTala stores and what each value means. Firmware (`firmware/`), Security Rules (`firestore.rules`), the simulator (`devtools/`), and the mobile app (`mobile/`) must all agree with this file. If you change a field here, search all four for it.

Status: **draft, 24 Oct 2026.** No real hardware has produced a reading yet; every reading so far is simulated.

## Collections

```
users/{uid}                                  one app account's profile and alert preferences
users/{uid}/notifications/{notificationId}   alerts for that account
users/{uid}/alertState/{deviceId}_{metric}   last status per device and field (alert de-duplication)
devices/{deviceId}                           one monitoring unit (ESP32 + probes)
devices/{deviceId}/readings/{readingId}      one sample from that unit
```

Server-only (written by Cloud Functions with firebase-admin; no app account can read or write them, tested in `devtools/rules.test.mjs`):

```
alertDeliveries/{id}   one email or SMS: email_{uid}_{deviceId}_{readingId} or sms_{uid}_{deviceId}_{metric}_{alertedAtMs}
smsBudget/global       SMS counted per Philippine day and month, for the caps
```

`alertDeliveries` fields: `channel` (`email`/`sms`), `uid`, `deviceId`, `readingId`, `metric` (SMS), `status` (`sending` → `sent`/`failed`, or `skipped: day|month cap reached`), `detail` (provider outcome, no secrets or recipients), `createdAt`, `updatedAt`. The record is created **before** sending; a second run for the same reading or episode finds it and sends nothing. `smsBudget/global`: `{ day: "2026-11-04", dayCount, month: "2026-11", monthCount }`.

### `users/{uid}`

Created at sign-up (email) or on the "Complete your profile" screen (Google). The app treats an account as ready only when this document exists **and** `phoneE164` is set; until then it shows that screen.

| Field | Type | Meaning |
|---|---|---|
| `displayName` | string | 1–60 characters. |
| `phoneE164` | string \| null | Philippine mobile number, `+639XXXXXXXXX` (pattern enforced by rules and `mobile/src/domain/phone.ts`). Personal data: never log it. |
| `smsAlertsEnabled` | boolean | User wants SMS alerts. Cannot be `true` while `phoneE164` is `null`. Set to `true` whenever the app saves a number (sign-up, complete profile, editing the number); the user can switch it off. **Nothing sends SMS yet** (needs Cloud Functions). |
| `pushEnabled` | boolean | User allowed app notifications and Android granted the permission. The app asks once per account per phone on first entry (after onboarding), then only via the Settings switch. Nothing sends push yet. |
| `createdAt` | timestamp | Server time at creation, never changed. |
| `updatedAt` | timestamp | Server time of the last write (rules require `== request.time`). |

Only the owner can read or write it; it cannot be deleted from the app. Email lives in Firebase Auth, not here.

### `users/{uid}/notifications/{notificationId}`

Alerts. Until Cloud Functions exist, the app raises them itself **while it is open** (`mobile/src/services/alerts.ts`, decision in `mobile/src/domain/alerts.ts`): one alert when a field's status gets worse (normal → warning → critical, per `mobile/src/domain/thresholds.ts`). Within 30 minutes of an alert, the same or a lower level does not alert again (a value bouncing across a limit); a worse level always does. Wording (`alertText` in `mobile/src/domain/alerts.ts`): the title names the device and what is wrong in plain words, e.g. "Tank 2: water too hot"; the body gives the value and normal range, e.g. "Water is 36.2 °C. Normal is 20 to 32 °C.", then caveats last: uncalibrated pH adds "The pH sensor is not calibrated yet, so this may be off.", simulated data adds "Test data, not a real sensor." Fields: `title` (≤80), `body` (≤200), `deviceId`, `metric` (`ph`/`temperatureC`/`nh3GasMv`), `value` (number|null), `level` (`warning`/`critical`), `readingId`, `createdAt` (server time), `read` (false on create).

The document ID is `{deviceId}_{metric}_{readingId}`, enforced by the rules. The owner may create alerts only for devices they own, mark them read, and delete them.

### `users/{uid}/alertState/{deviceId}_{metric}`

Shared by all of the user's phones, so one ongoing condition raises one alert even with two phones or after a reinstall. Written in the same Firestore transaction as the alert: if the alert fails, the state is unchanged and the next reading tries again.

| Field | Type | Meaning |
|---|---|---|
| `level` | `normal` | `warning` | `critical` | Last status seen. |
| `alertLevel` | `warning` | `critical` | null | Level of the last alert raised. |
| `alertedAt` | timestamp | null | When that alert was raised (cooldown). |
| `updatedAt` | timestamp | Server time of the write. |

Owner only. Each phone touches this record only when a field's status changes, not on every reading, to keep Firestore reads low. Verified on the emulator (28 Oct 2026): two phones racing on the same reading produce one alert; the loser gets `permission-denied` and does nothing on its next try.

### Alert ranges

Water type: **fresh / tap water** (decided 4 Nov 2026). `mobile/src/domain/thresholds.ts` is the only definition:

| Field | Normal | Warning | Critical | Status words (cards and alert titles) |
|---|---|---|---|---|
| pH | 6.5–8.5 | 6.0–6.5 / 8.5–9.0 | below 6.0 / above 9.0 | A bit low, Too low / A bit high, Too high |
| Temperature | 20–32 °C | 15–20 / 32–35 °C | below 15 / above 35 °C | A bit cold, Too cold / A bit warm, Too hot |
| Ammonia gas | up to 600 mV | 600–900 mV | above 900 mV | A bit high, Too high |

pH 6.5–8.5 is the usual drinking-water guideline range. Temperature has no safety limit for tap water; its range only flags unusual water. **Ammonia gas ranges are placeholders** until the real sensor's baseline is measured in clean air above clean water. Status words are plain on purpose ("too high", not "too basic").

### Alert policy for SMS and email

Decided 4 Nov 2026. **Built for reading alerts in `functions/` and tested on the emulator; not deployed** (needs Blaze), and SMS/email go to log-only providers until TextBee/Brevo are added. Not built yet: push from the server (the app does not store push tokens yet), the offline / sensor-not-reading checks, the "SMS limit reached" notice in the app, and an email on/off switch (the server treats a missing `emailAlertsEnabled` as on). The board never sends alerts; the function `onReadingCreated` evaluates each uploaded reading with the app's own `domain/thresholds.ts` and `domain/alerts.ts`, through the same `alertState` transaction and alert ID as the app, so the app (while open) and the server never raise the same alert twice. An SMS "episode" is one critical alert: the SMS goes out on the 3rd critical reading in a row and not again until a new critical alert is raised (after recovery and the 30-minute cooldown). Simulated devices never get SMS. SMS is scarce (TextBee plan: 300/month), so it is kept for critical pH and temperature only.

| Event | Push | Email | SMS |
|---|---|---|---|
| pH or temperature warning | yes | yes | no |
| pH or temperature critical | yes | yes | yes, after 3 critical readings in a row; pH only when calibrated |
| Ammonia gas warning or critical | yes | yes | no (ranges are placeholders) |
| A sensor sends no value for 10 min (gas: after warm-up) | yes | yes | no |
| Device offline (no readings for 30 min) / back online | yes | yes | no |
| SMS monthly limit reached | yes | yes | no |

SMS rules: one SMS per ongoing condition (same cooldown as above); conditions on the same device within a few minutes go in one SMS; at most 5 per day and 250 per month across all devices (50 kept for testing), counted per recipient; past a cap, alerts still go by push and email and the app shows that the SMS limit was reached. SMS text uses no symbols such as "°" (they switch the SMS to a format that fits fewer than half as many characters), e.g. `TubigTala: Tank 1 pH TOO HIGH 9.4 (normal 6.5-8.5) at 3:42 PM`. Check how TextBee counts multi-part SMS against the 300 before building. Email carries the reading, normal range, time, the last hour's trend and a note that this is a prototype sensor, not a lab test.

### `devices/{deviceId}`

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Label shown in the app, e.g. "Tank 1". 1–40 characters. |
| `ownerUid` | string | Firebase Auth uid of the user who may view this device. |
| `deviceUid` | string | Firebase Auth uid the ESP32 signs in as. Only this account may write readings. Never the same as `ownerUid`. |
| `simulated` | boolean | `true` for the `devtools/` simulator. Readings from a simulated device must carry `simulated: true` (enforced by rules). |
| `readingIntervalSec` | number | How often the device is expected to send a reading. Drives stale/offline status. Default 60. |
| `phCalibration` | map | `{ status: "uncalibrated" \| "calibrated", calibratedAt: timestamp \| null, method: string \| null, ph7Mv?: number, ph4Mv?: number, ph7BufferPh?: number, ph4BufferPh?: number }`. Saved by the app's Calibrate pH screen (owner only; buffers 100–1500 mV apart; `calibratedAt` = server time). `ph7Mv`/`ph4Mv`: module output in the neutral / acid buffer, mV. `ph7BufferPh`/`ph4BufferPh`: those buffers' true pH, 6.5–7.5 and 3.5–4.5 (e.g. 6.86 / 4.01); absent in calibrations saved before 4 Nov 2026, which means 7.00 / 4.00. pH = `ph7BufferPh + (mV − ph7Mv) × (ph7BufferPh − ph4BufferPh) / (ph7Mv − ph4Mv)`, identical in `mobile/src/domain/calibration.ts` and the firmware. The board reads the record at start and every 10 min, applies it and keeps a copy in flash. The per-reading `phCalibrated` flag records which was in use; stored readings are not recalculated. |
| `createdAt` | timestamp | Server time. |

Clients cannot create or delete devices. They are provisioned by an admin (Firebase console, `docs/device-setup.md`; `devtools/` on the emulator). The owner may change only `name` and `phCalibration`. The board (its `deviceUid` account) may read its own device record, to pick up its calibration.

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
| `phMv` | number \| null | mV, 0–5500 | pH module output voltage (after undoing the divider). Kept so readings can be recalculated after calibration. |
| `temperatureC` | number \| null | °C, −10–60 | DS18B20 water temperature. `null` when disconnected (`-127`) or the power-on value (`85.0`). |
| `nh3GasMv` | number \| null | mV, 0–5500 | MQ-137 module analog output voltage (after undoing the divider). **Ammonia gas in air above the water, uncalibrated.** Not ppm, not dissolved ammonia. Higher = more gas, relative only. |
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

- A user can read and write only their own `users/{uid}` profile (valid fields only); read, mark read and delete their own notifications; and create well-formed, de-duplicated alerts only for devices they own.
- A user can read a device, and its readings, only if they are its `ownerUid`.
- Only the device's `deviceUid` can create readings, and only well-formed ones (types, ranges, `serverTime == request.time`, `simulated` matches the device).
- Nobody can update or delete readings from a client.
- Anything not listed is denied.
