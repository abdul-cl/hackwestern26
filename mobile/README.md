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
