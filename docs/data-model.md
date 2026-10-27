# Data model

The one definition of what TubigTala stores and what each value means. Firmware (`firmware/`), Security Rules (`firestore.rules`), the simulator (`devtools/`), and the mobile app (`mobile/`) must all agree with this file. If you change a field here, search all four for it.

Status: **draft, 24 Oct 2026.** No real hardware has produced a reading yet; every reading so far is simulated.

## Collections

```
users/{uid}                                  one app account's profile and alert preferences
users/{uid}/notifications/{notificationId}   alerts for that account (written by the backend)
devices/{deviceId}                           one monitoring unit (ESP32 + probes)
devices/{deviceId}/readings/{readingId}      one sample from that unit
```

Planned, not built yet: `alertRules`, `alertEvents` (step 6, needs Cloud Functions / Blaze).

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

Alerts. Until Cloud Functions exist, the app raises them itself **while it is open** (`mobile/src/components/alert-watcher.tsx`): when a reading's status gets worse (normal → warning → critical, per `mobile/src/domain/thresholds.ts`), it creates one. Fields: `title` (≤80), `body` (≤200), `deviceId`, `metric` (`ph`/`temperatureC`/`nh3GasMv`), `value` (number|null), `level` (`warning`/`critical`), `readingId`, `createdAt` (server time), `read` (false on create).

The document ID is `{deviceId}_{metric}_{readingId}`, enforced by the rules, so two phones open at once cannot both raise the same alert. The owner may create alerts only for devices they own, mark them read, and delete them.

### Alert ranges (placeholder)

`mobile/src/domain/thresholds.ts` is the only definition: pH normal 6.5–8.5 (warning 6.0–9.0), temperature normal 20–32 °C (warning 15–35), ammonia normal up to 600 mV (warning up to 900). **Placeholders** until the water type is decided; ammonia ranges need the real sensor's baseline.

### `devices/{deviceId}`

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Label shown in the app, e.g. "Tank 1". 1–40 characters. |
| `ownerUid` | string | Firebase Auth uid of the user who may view this device. |
| `deviceUid` | string | Firebase Auth uid the ESP32 signs in as. Only this account may write readings. Never the same as `ownerUid`. |
| `simulated` | boolean | `true` for the `devtools/` simulator. Readings from a simulated device must carry `simulated: true` (enforced by rules). |
| `readingIntervalSec` | number | How often the device is expected to send a reading. Drives stale/offline status. Default 60. |
| `phCalibration` | map | `{ status: "uncalibrated" \| "calibrated", calibratedAt: timestamp \| null, method: string \| null }`. Informational; the per-reading `phCalibrated` flag is what the app shows. |
| `createdAt` | timestamp | Server time. |

Clients cannot create or delete devices yet. They are provisioned with `devtools/` (admin) until a claim flow exists. The owner may only rename (`name`).

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
