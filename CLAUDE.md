# CLAUDE.md — IoT Water Monitoring System

Project rules for AI-assisted development. Read this before generating or editing code, firmware, configuration, or documentation.

## What this project is

An IoT-based water monitoring prototype using an ESP32 and sensors to collect pH, temperature, and ammonia-gas readings, with a mobile app and web client for viewing readings and history. The system can issue configurable alerts through SMS, email, and mobile push notifications.

This is a prototype and must not be described as a certified drinking-water safety system. The MQ-137 measures ammonia gas in air; it does **not** directly measure dissolved ammonia concentration in water. Label that measurement accurately in the UI, data model, reports, and alerts.

## Isolation from Dagitab (read first)

This laptop also hosts a separate, live project: **Dagitab** (smart energy monitor) at `C:\App\WattWise` and `C:\App\WattWise-Web`, Firebase project `wattwise-fe394`, GitHub account `magatnokia-design`. It has real users. **Nothing done in this project may change, deploy to, or log out of anything Dagitab uses.**

This project **shares Dagitab's GitHub and Firebase accounts** (`magatnokia-design` / `magatnokia@gmail.com`) but has its own repo and its own Firebase project. Expo is not set up yet.

**Because the Firebase account is shared, the CLI can see and deploy to Dagitab's `wattwise-fe394` from this folder.** The only thing choosing the project is `.firebaserc` here (`default` -> `tubigtala-64d9e`). There is no account boundary behind it. Treat every Firebase command accordingly:
- `firebase use` must print `tubigtala-64d9e` before any deploy. If it prints anything else, stop.
- Never pass `--project wattwise-fe394`, never `firebase use wattwise-fe394`, and never pick `wattwise-fe394` from an interactive project list (`firebase use --add`, `firebase init`). On 24 Oct 2026 a failed `projects:create` left `wattwise-fe394` as the only choice in that list.
- A deploy that offers to **delete** functions this project never wrote is pointed at Dagitab. Answer No.

### Accounts: bind per folder, never swap globally

| Tool | Dagitab (leave alone) | This project | How it is kept apart |
|---|---|---|---|
| Firebase CLI | `magatnokia@gmail.com` | **same** account (pinned to this folder 24 Oct 2026; a separate `noahmagat0715` account was tried and logged out) | nothing to keep apart at the account level - see the warning above |
| Firebase project | `wattwise-fe394` | `tubigtala-64d9e` (display name "tubigtala"), created in the console 24 Oct 2026, Spark plan | `.firebaserc` here; `firebase use` must print `tubigtala-64d9e`. `watermoni-cli` and `tubigtala` were taken by other users. |
| git commits | `magatnokia-design` / `magatnokia@gmail.com` (global config) | **same** - global identity, no repo-local override | nothing to keep apart; never change the global config from here |
| git push | `magatnokia-design` -> `WattWise` | `magatnokia-design` -> https://github.com/magatnokia-design/tubigtala (**public**) | same account, different repo - nothing to keep apart |
| gh CLI | `magatnokia-design` | **same** account - `gh` works here as-is | never `gh auth switch` / `logout` - Dagitab's APK workflow runs through this login |
| Expo / EAS | n/a locally (Dagitab builds in CI) | not set up yet | `$env:EXPO_TOKEN` per shell, `npx eas-cli`; never `eas login` |

The repo is **public**: every pushed file is world-readable. Run `git status` and check the staged list before each commit.

Rules:
- **Never run** `firebase login` (replaces the account), `firebase logout`, `gh auth logout`, `gh auth switch`, `git config --global ...`, or `eas login`. Each changes state Dagitab depends on.
- Before any Firebase command, run `firebase login:list` here and confirm the active account is this project's. Never delete `firebase.json` from this folder: without it the folder pin stops applying and commands run as Dagitab's account. Per-folder pins live in `activeAccounts` in `%USERPROFILE%\.config\configstore\firebase-tools.json`. Before any deploy, open `.firebaserc` and confirm it names this project's ID - never `wattwise-fe394`.
- If a Firebase deploy ever offers to **delete** functions or lists functions this project never wrote, answer **No** and stop - it is pointed at the wrong project.
- Before any `gh` command, run `gh auth status` and confirm the active account.
- Tokens (`EXPO_TOKEN`, provider keys) live in the shell or an ignored `.env`, never in tracked files.

### Shared Arduino toolchain - the one thing separate accounts do not fix

Both projects use the same Arduino installation:
- Libraries: `C:\Users\magat\OneDrive\Documents\Arduino\libraries` (shared sketchbook)
- Cores: `C:\Users\magat\AppData\Local\Arduino15` (ESP32 core 3.3.11)

Dagitab's firmware requires **ArduinoJson 6.21.5**. The IDE will keep offering 7.x - **do not update it**, and do not install a library that pulls in ArduinoJson 7. If this project needs JSON, write it against 6.21.5 (`StaticJsonDocument`, `createNestedObject`). Do not upgrade, downgrade, or remove the ESP32 core or any library Dagitab uses (`ArduinoJson`, `PZEM004Tv30`) without asking. Adding new libraries (OneWire, DallasTemperature, etc.) is fine.

If arduino-cli is used, give this project its own build directory (`C:\App\WaterMonitoring\.arduino-build`) and pass the same path to `--build-path` (compile) and `--input-dir` (upload) - never Dagitab's `C:\App\WattWise\.arduino-build`.

### Two ESP32s on one laptop

Dagitab's Hub is also an ESP32. Uploading to the wrong COM port would overwrite the Hub's firmware.
- **Unplug the Hub** before flashing this project's board.
- Run `arduino-cli board list` (or check Tools > Port in the IDE) before every upload and confirm the port.

### Off-limits paths

Do not read-modify-write, delete, or run commands inside `C:\App\WattWise` or `C:\App\WattWise-Web` from this project. Referring to them to learn a pattern is fine; changing them is not.

## Planned stack

- **Hardware / firmware:** ESP32 DevKit; Arduino IDE / Arduino-compatible C++
- **Mobile app:** React Native + Expo, targeting Android
- **Web client:** React + Vite + TypeScript
- **Backend / data:** Firebase Authentication, Cloud Firestore, and Cloud Functions where appropriate
- **SMS:** TextBee Android SMS gateway, sending through the registered Android phone and SIM
- **Email:** Brevo transactional email API
- **Push notifications:** Expo Notifications / Expo Push Service
- **Version control:** Git and GitHub
- **Hosting:** Confirm the actual deployment target before adding or changing hosting configuration

This is the intended stack, not proof that every service is already configured. Inspect the repository and current cloud setup before assuming a feature exists or a service is connected.

Do not introduce a different database, backend, state-management library, CSS framework, notification provider, or major dependency without explaining the reason and asking first.

## How I want you to work with me

- **Explain before you edit.** Tell me what you found and what you intend to change. I would rather read three sentences first than review a diff that went the wrong way.
- **When I say something is missing, hunt for it.** Do not stop at the first plausible answer. If I report one bug, check whether the same shape exists elsewhere.
- **Do not guess at facts you can check.** Read the file, run the command, inspect the logs, and check configuration. Distinguish verified facts from assumptions.
- **Say "I don't know."** If a decision depends on something you cannot verify, say so.
- **Correct me when I am wrong**, including when I blame the wrong thing. Check the evidence and explain what it supports.
- **Do not over-apologise.** Fix the issue and explain it briefly.
- Do not silently change public interfaces, data shapes, function signatures, sensor units, thresholds, or notification behavior used elsewhere. Find the callers and flag compatibility risks first.

## Environment and CLI

- **Windows / PowerShell.** Give PowerShell commands, not Bash. Use `$env:NAME = 'value'`, not `export NAME=value`.
- Prefer CLI tools over console clicks, but clearly say when a step cannot be scripted and provide the relevant dashboard path.
- Check what is installed before writing instructions that depend on it (`node`, `npm`, `git`, `gh`, Firebase CLI, Expo/EAS CLI, Arduino CLI, and any other tool needed).
- Show commands before running them when they modify configuration, cloud resources, hardware state, or deployment state.
- Long-running commands should run in the background when practical; report how to inspect their output and how to tell when they finish.
- Never claim a cloud console setting or local tool was checked unless it was actually checked.
- Installed on this machine (checked 24 Oct 2026): Node 24.20.0, npm 11.19.0, git 2.55.0, Firebase CLI 15.28.2, gh 2.98.0, arduino-cli 1.5.1 (ESP32 core 3.3.11). EAS is **not** installed globally - use `npx eas-cli` (25.3.0). Firebase, git and gh logins are machine-wide and shared with Dagitab - see "Isolation from Dagitab".

## Git and GitHub

- **Commit and push when I ask, not before.**
- Never force-push, run `git reset --hard`, or run `git clean`. These can destroy ignored or untracked work.
- Commit messages should explain why the change matters, not merely what changed.
- Record hard-won lessons in `CLAUDE.md`, `docs/`, or a relevant code comment, not only in a commit message.
- CI builds, app builds, firmware flashing, releases, and deployments are separate permissions. **Ask explicitly before starting a paid build or publishing/deploying anything.**
- Do not merge a PR without explicit approval.
- Before deleting or overwriting anything, show what is there and explain the effect.
- Use focused branches and changes where practical. Do not bundle unrelated features into one change.

## Standard of proof

A command exiting successfully is not evidence that the thing worked.

- Generated a file? Open it and verify its contents.
- Changed a service or API integration? Exercise the actual request path where possible and inspect its response/logs.
- Changed a UI? Verify the relevant route or interaction, not only that the project builds.
- Changed firmware? Verify the sensor or GPIO behavior using serial output or a real measurement where safe.
- Claimed something is unaffected? Show the check that supports the claim.
- **A null result is not a pass.** A zero reading, empty query, missing notification, or successful HTTP response may still be consistent with a broken downstream component. Ask what result would look the same if the system were broken.
- Distinguish tests that were run from checks that could not be performed due to missing hardware, credentials, connectivity, or access.

## Finding bugs: isolate one layer at a time

Trace a reported behavior across its actual path. For example, for an automated SMS alert:

1. **Sensor / firmware:** confirm a real or controlled test reading is captured.
2. **Transport:** confirm the ESP32 uploads the expected value, timestamp, units, and device identity.
3. **Database:** confirm the intended Firestore document exists and is readable by the authorized service.
4. **Rule evaluation:** confirm the threshold and cooldown logic evaluates the same value and units shown in the UI.
5. **Backend dispatch:** inspect the Cloud Function result and provider response.
6. **Provider / gateway:** confirm TextBee accepted the request and the Android gateway is online.
7. **Delivery:** confirm the recipient actually received the SMS. An accepted API request alone is not proof of delivery.
8. **Other surfaces:** confirm the mobile app and web client display consistent readings and alert status.

For every test, state which layer it clears and what remains unverified. Read logs before theorising. Do not keep proposing code changes when evidence points to wiring, power, sensor calibration, carrier restrictions, or a provider outage.

Check the user's own project history and prior fixes when relevant. A previous occurrence may be more useful than a new theory.

## Consistency across mobile, web, backend, and firmware

- **Two surfaces answering the same question differently is a bug.** Define the correct rule once and apply it everywhere. Each surface should make units, timestamps, stale/offline status, and alert state clear.
- When fixing a shared behavior, search all clients, backend functions, firmware, and documentation for other copies or stored values that might disagree.
- Define a single documented meaning and unit for each reading. Do not silently mix raw ADC values, calibrated values, and engineering units.
- Preserve the distinction between `0`, `null`/missing, stale, invalid, and unavailable data. Do not coerce missing readings into zero.
- Do not present simulated readings as real hardware measurements. Clearly label demo/mock data.
- Make thresholds, alert wording, and cooldown behavior consistent between the mobile app, web client, and backend.
- If files are intentionally copied between packages or repositories, list them and verify byte identity when required. Watch line endings to avoid noisy diffs.

## Sensor and hardware rules

- Never assume a sensor is calibrated because it returns a number.
- **pH:** document calibration steps and calibration status. For a prototype, calibrate with appropriate buffer solutions (commonly pH 4 and pH 7) and record the method used.
- **DS18B20:** document units, wiring, and error handling for disconnected or invalid readings.
- **MQ-137:** treat it as an ammonia-gas sensor for air. Do not label its uncalibrated analog value as dissolved ammonia in water or as a reliable ppm measurement. Meaningful concentration claims require suitable calibration and known reference conditions.
- ESP32 GPIO is 3.3 V logic. Verify every module's output voltage before connecting it to an ADC/GPIO. Do not assume a 5 V sensor output is safe for the ESP32; use an appropriate divider or buffer where required.
- Keep electronics, exposed circuit boards, and non-waterproof parts dry. Only place probes rated for immersion in water.
- Check power requirements, shared ground, sensor warm-up, wiring, and calibration before blaming firmware.
- Never re-flash firmware to test behavior that an existing serial command or diagnostic interface can already expose.
- Opening a serial port can reset some boards. Warn me before opening a serial connection if that could reset the ESP32 or interrupt a test.
- Tell me immediately when a test changes physical state. If a relay, pump, or other load is switched, state what changed and what it was restored to.
- Do not energize mains-connected hardware or switch a physical load without explicit approval and a clear safety check. Prefer low-voltage, isolated tests where possible.
- Do not claim the prototype certifies drinking-water safety or replaces a laboratory test.

## Firebase, data, and security

- Use Firebase Authentication for user identity if authentication is enabled; do not invent a separate custom login system.
- Every Firestore collection containing user/device data needs a deliberate access-control design and tested Security Rules. Never rely on hidden UI controls as security.
- Do not make Firestore broadly readable or writable to avoid an authorization error.
- ESP32 credentials and device identity must be scoped and protected. Do not embed privileged Firebase credentials, service-account keys, or backend secrets in firmware or client bundles.
- Put privileged operations, threshold enforcement, and third-party provider calls in trusted backend code when appropriate.
- Use server-side secrets/configuration for Cloud Functions. Never expose TextBee or Brevo API keys through `VITE_` variables, mobile-app bundles, browser code, source control, screenshots, or logs.
- Validate and bound readings before storing or acting on them. Handle missing, stale, malformed, and implausible values explicitly.
- Add timestamps and device identity to readings. Document whether timestamps originate from the device or server and how clock/network failures are handled.
- Plan for offline devices, retries, duplicate uploads, and transient provider/database failures. Avoid duplicate alerts when a request is retried.
- Do not log API keys, tokens, phone numbers, email addresses, or other secrets unnecessarily.

## Notifications: TextBee, Brevo, and Expo

- **TextBee:** sends SMS through the configured Android gateway and SIM. The phone must be available, online to the gateway service, and have eligible SMS service. API acceptance does not prove delivery. Check provider documentation for current endpoint, authentication, limits, and response fields before coding.
- **Brevo:** use its transactional email API from trusted backend code. Keep the API key server-side. Check sender/domain verification, account limits, and provider errors. Dagitab also sends through Brevo - use this project's own Brevo account or at least its own API key and sender, so the two projects do not share quota or sender reputation.
- **Expo Notifications:** use the appropriate Expo push setup and credentials. Verify current Expo SDK requirements; do not assume remote push works in Expo Go on Android.
- Keep notification channels independently configurable where practical. A failure in one channel should not silently claim that all channels succeeded.
- Record alert status and provider result without storing secrets. Use retry limits and a cooldown/deduplication key to avoid sending repeated messages for the same continuing condition.
- Do not send real SMS or email, or consume paid credits, during tests without explicit approval. Use test recipients or mocked providers first.
- Do not hardcode recipient phone numbers, email addresses, API endpoints that differ by environment, or threshold values throughout the codebase.
- Alert messages should identify the device/sample, reading, unit, threshold, and timestamp when available. Do not imply a water-safety conclusion unsupported by the sensors.

## Architecture and code organization

Inspect the actual repository before enforcing or adding folders. Adapt these principles to existing conventions rather than inventing a new structure without asking.

- Keep UI components focused on presentation and user interaction.
- Put database/provider access behind service modules; do not scatter direct Firestore or provider calls across screens.
- Keep business rules, sensor interpretation, threshold evaluation, and notification dispatch testable and separate from UI code.
- Share types and validation schemas where they can genuinely be shared across mobile, web, and backend packages. Avoid copying business logic in ways that can drift.
- Use TypeScript strict mode where TypeScript is configured. Avoid `any` unless justified in a comment.
- Handle loading, empty, offline, stale, permission-denied, and error states explicitly.
- Do not add packages for functionality already supported by the existing stack without explaining the need and asking first.
- Do not silently change an exported function signature or persisted data shape. Identify callers and migration implications first.
- Use mock data only when clearly labelled and keep it shaped like real records. Simulate async loading and include empty/error cases during frontend-first work.

## Validation and empty states

- Audit each input against its submit handler. Include empty values, whitespace-only values, invalid phone/email formats, malformed numbers, minimum above maximum, out-of-range thresholds, and unexpected units where relevant.
- Client-side validation improves UX but is not a security boundary. Validate again in trusted backend code.
- Distinguish "no readings exist" from "the device is offline," "the query failed," "permission was denied," and "the data could not be checked."
- A flag that is computed but never reaches the screen is not a fix. Trace service → hook/state → component → rendered UI.
- Watch for silent failures: wrong imports, mismatched field names, stale cached values, CSS/module name mismatches, and missing metadata.
- Test alert boundaries (below, equal to, and above threshold), invalid readings, reconnects, duplicate uploads, and cooldown behavior.

## Forms and UI consistency

- Use the form and validation libraries already installed in the repository. Do not introduce a new form stack without asking.
- Keep validation schemas near the forms that use them unless the existing architecture has a shared-schema convention.
- Show field-level validation messages for multi-field forms.
- Reuse established design tokens and components. Do not invent one-off colors, spacing, or typography when the project has a design system.
- Keep the mobile app and web client consistent in naming, units, thresholds, timestamps, empty/error states, and alert history.

## Environment variables and secrets

Actual secrets belong in local environment files or the hosting provider's secret manager, never in tracked source files.

Document the variables actually used by the project in `.env.example` and this file. Likely server-side settings may include:

- Firebase project/configuration identifiers appropriate to each runtime
- `TEXTBEE_API_KEY` and `TEXTBEE_GATEWAY_ID` (backend only)
- `BREVO_API_KEY` (backend only)
- Sender identity and notification settings required by the chosen provider

Use `VITE_` only for values intentionally exposed to the browser; **never use it for TextBee, Brevo, service-account, or other privileged secrets**. Mobile public configuration is not a secure place for server credentials either.

Before the first commit, inspect `.gitignore` and confirm local environment files, credentials, service-account JSON, signing files, and build outputs are excluded. If a secret is accidentally committed, do not merely delete it in a later commit: tell me and advise rotating/revoking it.

## GitHub, builds, and deployments

- Check which CLI tools are installed before relying on them.
- Prefer preview/staging environments before production.
- A code change, local build, CI run, app-store release, firmware flash, and production deployment are separate actions.
- Ask explicitly before running paid builds, sending real messages, flashing hardware, or deploying/publishing.
- After a deployment that I approved, verify the deployed URL or endpoint responds and inspect logs where possible.
- Do not claim a mobile build is installable until the artifact exists and has been checked.
- Keep a changelog/version/download link in sync only after a release artifact actually exists.

## Destructive and outward-facing actions

Ask first, every time, before:
- Deleting or overwriting files, data, branches, or migrations
- Resetting databases or changing production data
- Force-pushing, hard resets, or cleaning untracked files
- Sending real SMS/email or consuming paid provider credits
- Flashing firmware when it may interrupt a live test
- Starting a paid build, deploying to production, publishing, or releasing
- Merging a pull request
- Changing any machine-wide login, global config, or shared Arduino library/core (see "Isolation from Dagitab")

Approval for one instance is not approval for the next. Before deleting anything, show what is there first. Write destructive scripts in dry-run mode by default and require an explicit confirmation value to proceed.

`.claude/settings.json` denies the worst of these outright (force-push, hard reset, `git clean`, `rm -rf`, global git config, CLI logins/logouts, anything naming `wattwise-fe394`, `arduino-cli lib upgrade`), because a rule a model can talk itself past is not a guardrail.

## Documentation to leave behind

Assume I may be maintaining the project alone later. Keep these current, in rough priority order:

1. **Rebuild runbook:** required tools, versions, installs, logins, configuration, and what does not survive a reset.
2. **Triage guide:** symptom → checks → likely layer → relevant file/log.
3. **Wiring/config map:** ESP32 pin assignments, voltage levels, sensor connections, calibration steps, and enclosure/power notes.
4. **Deployment and secrets guide:** Firebase setup, Security Rules, Cloud Functions secrets, TextBee gateway setup, Brevo sender setup, Expo push configuration, and environment variables.
5. **Shutdown/cost runbook:** what can incur charges, how to disable services in a safe order, and what data/configuration to export first.

Write documentation so it works without help or memory of the conversation. Do not put real secrets in documentation.

## Suggested implementation workflow

1. Inspect the repository, current branch, package scripts, installed tools, and existing project structure.
2. Confirm the intended change and list affected layers before editing.
3. Make one focused change at a time.
4. For schema/security changes, update rules and tests alongside the data model.
5. For hardware changes, verify wiring, power, and calibration assumptions before modifying firmware.
6. Test the smallest relevant layer, then test the end-to-end path.
7. Inspect the resulting diff and generated files; report what was verified and what could not be tested.
8. Update documentation for any lasting lesson, configuration change, or new workflow.
9. Commit, push, build, deploy, or release only when explicitly asked.

## Current status

Location: `C:\App\WaterMonitoring` (moved from `C:\WaterMonitoring` on 24 Oct 2026). Sibling of Dagitab's `C:\App\WattWise`, never inside it - the Firebase CLI and Claude Code both read config from parent folders.

Setup checklist (update as items are done):

- [x] Git repo, branch `main`, global identity `magatnokia-design`, remote `origin` -> `magatnokia-design/tubigtala` (switched from a separate `Noah-Magat` account on 24 Oct 2026; GitHub is shared with Dagitab, Firebase is not)
- [x] `.gitignore`, `.claude/settings.json` guardrails, placeholder `firebase.json` (`{}` - keeps the Firebase folder pin local; `firebase init` may replace its contents, but never delete it)
- [x] First commit made locally (24 Oct 2026)
- [ ] **First push** - `git push -u origin main` (uses the existing `magatnokia-design` login; no new sign-in expected)
- [x] **Firebase account** - `magatnokia@gmail.com`, shared with Dagitab (24 Oct 2026)
- [x] **Firebase project** - `tubigtala-64d9e`, linked as `default` in `.firebaserc` (24 Oct 2026). Still on Spark.
- [ ] **Blaze + budget alert** - only when Cloud Functions are needed. Blaze is per project, so Dagitab's plan does not cover this one. Choose a billing account when upgrading (reusing Dagitab's or creating a new one is the user's call), then set a budget alert scoped to `tubigtala-64d9e` under Google Cloud console > Billing > Budgets & alerts.
- [ ] `firebase init` - decide the folder layout first (suggested: `firmware/`, `mobile/`, `web/`, `functions/`)
- [ ] Expo account + access token, Brevo, TextBee - when those features are reached

No application code or provider account (Expo, Brevo, TextBee) exists yet. The Firebase project exists but has no services enabled.

Planned architecture: ESP32 sensors → Firebase → mobile app and web client, with backend-triggered TextBee SMS, Brevo email, and Expo push notifications. Verify actual repository progress and configured services before treating any of these integrations as implemented.
