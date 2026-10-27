# TubigTala mobile app

Expo (SDK 58) + Expo Router + Firebase JS SDK, Android first. Run it with Expo Go against the local emulators: see [docs/runbook.md](../docs/runbook.md).

```powershell
npm start          # dev server; scan the QR code with Expo Go
npm test           # domain logic (status rules, formatting)
npm run typecheck
npx expo lint
```

## Layout

| Path | What lives there |
|---|---|
| `src/app/` | Screens (Expo Router). `_layout.tsx` decides what is reachable: `onboarding` -> `sign-in`/`sign-up` -> `complete-profile` (no phone yet) -> `(app)`. `(app)/(tabs)/`: `analytics`, `index` (Water, start tab), `settings`; plus `(app)/notifications` and `(app)/edit-profile`. |
| `src/domain/` | Pure logic with tests: types, device status (live/stale/offline/no-data), formatting. |
| `src/services/` | The only code that talks to Firebase. Screens never import `firebase/*`. |
| `src/hooks/` | Auth state and live Firestore subscriptions as loading/ready/error states. |
| `src/components/` | Presentation only. Colours come from `src/constants/theme.ts`. |

Data shapes and the status rule are defined in [docs/data-model.md](../docs/data-model.md); keep this app in line with it.

## Notes

- Install packages with `npx expo install <pkg>` so versions match the SDK.
- `tsconfig.json` maps `@firebase/auth` to its React Native typings; without it TypeScript cannot see `getReactNativePersistence` (the runtime is fine either way).
- Tests run on Node's built-in runner and are excluded from `tsc` (they need Node types the app should not have).
- `extra.eas.projectId` in `app.json` links the EAS project. EAS is not set up locally yet; use `npx eas-cli` with `$env:EXPO_TOKEN`, never `eas login` (see CLAUDE.md).
