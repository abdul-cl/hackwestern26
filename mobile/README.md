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

## What it has (same features as the website)

- Find: search form, live agent feed, map with status pins (tap a pin to jump to its card), ranked clinic cards,
  call scripts, Auto-fill waitlist (stops before Submit, you review it), Verify doctor (CPSO), Re-check, Watch clinic
- Watchdog: your watch list, Check all now, stop watching, recent alerts, Simulate opening (demo)
- Opening alert banner, watch count badge on the Watchdog tab, dot on the Find tab while a search runs
- How it works: the four agents, reading results, privacy + safety, FAQ, owner key for the public deployment
- `carescout://find?demo=1` (or `/find?demo=1` on web) starts the demo search

## Phone-only extras

- Use my location: fills in your city + postal code from GPS (iOS/Android only)
- Directions: opens Apple Maps / Google Maps to the clinic
- Call-back reminders: "Lines open Monday at 9:00 AM. Remind me?" opens the phone's own new-event screen, filled in
- Share a clinic through the share sheet (copies it on web)
- Haptics: light buzz when a clinic comes back accepting, stronger one for an opening alert

## Privacy + offline

- Offline: the last finished search and the form are kept on the phone, so results still show with no Wi-Fi
  ("Saved on this phone 2 h ago"). If a search can't reach the backend there's a "Show my last results" button.
- Saved details: Auto-fill can save your name, email, phone and postal code in the phone's encrypted keychain
  (expo-secure-store). They only come back after Face ID / fingerprint / passcode. "Forget" is on How it works.
  Phones only, browsers have no keychain.

## Handoff

- The QR button on Find opens "Open on another phone": a QR of the current search (city, postal code, coverage, language)
- Links fill in the form: `carescout://find?city=London%2C%20ON&postal=N6A%203K7&coverage=OHIP&language=French`
  (`&demo=1` also runs the demo). Bad values are ignored, city is capped at 100 characters.
- Website QR (needs Abdul's OK since frontend/ is his): on the website's Find page, show a QR of
  `carescout://find?` + the same params, e.g. with `qrcode.react`:
  `<QRCodeSVG value={"carescout://find?" + new URLSearchParams({ city, postal, coverage, language })} />`
  This opens in an installed build of the app. In Expo Go links look like `exps://.../--/find?...` instead.

## Design + motion

Fonts match the website (Bricolage Grotesque + Instrument Sans, JetBrains Mono for numbers/logs).
Animations use Reanimated (GSAP / React Bits / Lenis are web-only, so their effects are recreated natively):
the pulse line, word-by-word headline, staggered cards, count-up stats, score rings, springy buttons.
Same rule as the site: one hero moment, everything else only moves after you do something. Reduce motion is respected.

## Checks before pushing

```powershell
npx tsc --noEmit
npx expo lint
```
