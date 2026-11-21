# CareScout mobile

Expo (React Native + TypeScript) version of the CareScout site. One codebase for Android and iOS.

## Run it

```powershell
cd mobile
npm install
npx expo start
```

Then in that terminal:
- `a` opens it in the Android emulator (start the emulator from Android Studio first)
- `w` opens it in the browser
- teammates on a real phone: run `npx expo start --tunnel` instead and scan the QR code with Expo Go

## Backend URL

The backend has to be running (`cd backend` then `uvicorn app.main:app --reload --port 8000`).

With no `.env` the app uses `http://10.0.2.2:8000` on the Android emulator and `http://localhost:8000` on web.
A real phone can't reach either of those, so copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`
to something it can reach (a cloudflared tunnel or the deployed Railway URL). Restart with `npx expo start -c` after changing it.

## What's where

- `src/app/` screens (every file is a tab, `_layout.tsx` is the tab bar)
- `src/components/` form, live feed, clinic cards
- `src/lib/` API calls, types, colours, clinic helpers
- `src/hooks/useMission.ts` runs the live search stream
- `src/state/AppState.tsx` search + mission shared between tabs

## Done / next

- [x] Tabs, API layer, Find screen with live mission feed, clinic cards, call script, watch + re-check
- [ ] Auto-Fill waitlist + Verify Doctor
- [ ] Map (react-native-maps, list fallback on web)
- [ ] Watchdog tab (watch list, alerts, simulate opening)
