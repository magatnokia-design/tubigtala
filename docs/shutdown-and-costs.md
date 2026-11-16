# Costs and shutdown

What can cost money, what to watch, and how to turn everything off safely. Checked 16 Nov 2026.

## What costs money today

| Service | Plan | Cost now | Watch |
|---|---|---|---|
| Firebase project `tubigtala-64d9e` | **Blaze** (pay as you go) since 16 Nov 2026, budget alert USD 2 | USD 0 so far: usage stays inside the free daily allowance. Past it, requests are billed, not refused. | Free per day: Firestore 50,000 reads, 20,000 writes, 20,000 deletes, 1 GiB stored. The free day starts at midnight US Pacific time: 4 PM in the Philippines (3 PM while the US is on daylight time, March to early November); the console's daily bars use Pacific dates. Above it, in `asia-southeast1` (Google's price list, 16 Nov 2026): reads USD 0.0369 and writes USD 0.1107 per 100,000. Console > Firestore > Usage. |
| GitHub repo + Actions (APK builds) | Free (public repo) | ₱0 | Builds stay free while the repo is public. Making it private uses the account's free minutes (2,000/month). |
| Expo / EAS | Project registered, no EAS builds used | ₱0 | APKs are built on GitHub, not EAS. |
| Google sign-in, Firebase Auth | Free tier | ₱0 | |

Firestore usage (measured 16 Nov 2026 with Cloud Monitoring, `firestore.googleapis.com/document/read_count`, where noted):
- One board at one reading a minute writes ~1,440 readings a day.
- The board alone reads 6 documents an hour (its pH calibration check every 10 minutes, measured).
- The alert function reads about 4 documents per reading (device record + one alert state per field): ~5,800 a day. A field without a value costs nothing extra (its alert state is read either way).
- The station check (`checkStations`, every 5 minutes) reads about 3 documents per paired station per run: ~860 a day.
- A phone open on the Water tab reads about one document per reading.
- Analytics Live (app 0.9.3+) reloads once an hour (60–120 documents) plus one per new reading, and only while the app is on screen: ~3,000 a day if left open all day, nothing in the background. (Up to 0.9.2 it reloaded the hour every 5 minutes, even in the background: ~19,000 a day.)
- A chart or export reads every reading in its range: one day ≈ 1,440, 7 days up to 10,000 (the cap; Firestore allows no more in a live query). Since 0.9.3 switching Live ↔ By date does not reload the range (both stay loaded while the app is on screen).

So station + functions use about 14% of the free reads; a few long charts or exports a day by several users is what would go past it - at about USD 0.04 per extra 100,000 reads.

## Server-side alerts and SMS (on since 16 Nov 2026)

| What | Service | Cost model | Notes |
|---|---|---|---|
| Server-side alerts (app closed) | Firebase **Blaze** + Cloud Functions + Secret Manager | Pay as you go above a free monthly allowance | **On since 16 Nov 2026**: billing account "Nokia Billing Account", budget **USD 2** (set in the upgrade dialog). A budget alert only emails; it does not stop charges. Expected cost about USD 0: one function run per reading (~43,000 a month, free allowance is millions); `maxInstances: 2`. The station check `checkStations` adds ~8,600 runs a month, about 3 document reads per paired station per run (~860 a day), and one **Cloud Scheduler** job (free: 3 jobs per billing account; then USD 0.10 a month per job). To stop all server costs: delete both functions (`firebase functions:delete onReadingCreated checkStations --region asia-southeast1`), then downgrade the project to Spark in the Firebase console. |
| Phone notifications | Firebase Cloud Messaging, sent by the function | Free | One push per alert to each registered phone (app 0.9.2+). No extra account or key. First delivered 16 Nov 2026 with the app closed. |
| SMS alerts | TextBee + the gateway phone's SIM | SIM load per SMS | **Live since 16 Nov 2026** (first SMS delivered that day). Capped at 5 a day and 100 a month (`functions/src/policy.ts`); the emulator only logs, never sends. The TextBee account/phone is shared with another project (Smilebook): one monthly limit for both (TextBee free plan 300/month, received SMS included). |

No email alerts (dropped 13 Nov 2026), so there is no Brevo account or sender domain to pay for.

## Keep these before shutting anything down

These cannot be recreated from the repo:

- `C:\App\tubigtala-keystore\debug.keystore` - without it, new APKs will not install over old ones and Google sign-in needs re-registering.
- `mobile/google-services.json` (also a GitHub secret) - can be re-downloaded from the Firebase console while the project exists.
- `firmware/tubigtala/secrets.h` on each board's computer - Wi-Fi and device passwords.
- Data: use the app's **Analytics > Export** (7 days per file, per device) for the readings you want to keep. With Blaze on, a full export (`gcloud firestore export` into a Cloud Storage bucket, small storage cost) is also possible - do it before downgrading to Spark.

## Shutting down, in a safe order

1. **Stop new data:** unplug the boards (or delete `secrets.h` and re-flash a blank sketch).
2. **Export** what you want to keep (above).
3. **Disable sign-in:** Firebase console > Authentication > Sign-in method > disable Google and Email/Password. Installed apps can no longer sign in; existing data stays.
4. **Delete the data (optional, irreversible):** the Firestore database has **delete protection** on. Firebase console > Firestore > Disaster recovery / database settings > turn off delete protection, then delete the database. Ask yourself twice: there is no undo.
5. **Delete the project (optional):** Firebase console > Project settings > General > Delete project. Google keeps it recoverable for 30 days. **Check the project ID reads `tubigtala-64d9e` - never `wattwise-fe394` (Dagitab).**
6. **GitHub:** archive the repository (Settings > Archive) rather than deleting it, so the history and docs stay readable.

Nothing above touches Dagitab, but steps 4 and 5 happen in a Firebase console that also shows Dagitab's project. Read the project name at the top of the page before every click.
