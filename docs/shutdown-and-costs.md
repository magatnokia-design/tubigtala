# Costs and shutdown

What can cost money, what to watch, and how to turn everything off safely. Checked 28 Oct 2026.

## What costs money today

| Service | Plan | Cost now | Watch |
|---|---|---|---|
| Firebase project `tubigtala-64d9e` | **Spark (free)** | ₱0. Spark cannot be billed; when a limit is hit, requests fail instead. | Firestore: 50,000 reads, 20,000 writes, 20,000 deletes per day, 1 GiB stored. Console > Firestore > Usage. |
| GitHub repo + Actions (APK builds) | Free (public repo) | ₱0 | Builds stay free while the repo is public. Making it private uses the account's free minutes (2,000/month). |
| Expo / EAS | Project registered, no EAS builds used | ₱0 | APKs are built on GitHub, not EAS. |
| Google sign-in, Firebase Auth | Free tier | ₱0 | |

Rough Firestore usage: one board at one reading a minute writes ~1,440 readings a day. A phone open on the Water tab reads about one document per reading. A 7-day chart or export reads up to 10,080. Several long exports a day by several users is what would approach the read limit.

## What will cost money (not set up yet)

| When | Service | Cost model | Before enabling |
|---|---|---|---|
| Server-side alerts (app closed) | Firebase **Blaze** + Cloud Functions | Pay as you go above a free monthly allowance | Set a **budget alert**: Google Cloud console > Billing > Budgets & alerts, scoped to `tubigtala-64d9e`. A budget alert only emails; it does not stop charges. |
| SMS alerts | TextBee + the gateway phone's SIM | SIM load per SMS | Test with mocked sends first (CLAUDE.md) |
| Email alerts | Brevo | Free daily quota, then paid | Use TubigTala's own Brevo account/key, not Dagitab's |

## Keep these before shutting anything down

These cannot be recreated from the repo:

- `C:\App\tubigtala-keystore\debug.keystore` - without it, new APKs will not install over old ones and Google sign-in needs re-registering.
- `mobile/google-services.json` (also a GitHub secret) - can be re-downloaded from the Firebase console while the project exists.
- `firmware/tubigtala/secrets.h` on each board's computer - Wi-Fi and device passwords.
- Data: Spark has no managed Firestore export. Use the app's **Analytics > Export** (7 days per file, per device) for the readings you want to keep. A full export (`gcloud firestore export`) needs Blaze.

## Shutting down, in a safe order

1. **Stop new data:** unplug the boards (or delete `secrets.h` and re-flash a blank sketch).
2. **Export** what you want to keep (above).
3. **Disable sign-in:** Firebase console > Authentication > Sign-in method > disable Google and Email/Password. Installed apps can no longer sign in; existing data stays.
4. **Delete the data (optional, irreversible):** the Firestore database has **delete protection** on. Firebase console > Firestore > Disaster recovery / database settings > turn off delete protection, then delete the database. Ask yourself twice: there is no undo on Spark.
5. **Delete the project (optional):** Firebase console > Project settings > General > Delete project. Google keeps it recoverable for 30 days. **Check the project ID reads `tubigtala-64d9e` - never `wattwise-fe394` (Dagitab).**
6. **GitHub:** archive the repository (Settings > Archive) rather than deleting it, so the history and docs stay readable.

Nothing above touches Dagitab, but steps 4 and 5 happen in a Firebase console that also shows Dagitab's project. Read the project name at the top of the page before every click.
