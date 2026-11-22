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

## How it's built

Data flows one way: screens → shared state → hooks → `lib/` → backend. Anything several tabs need goes
through shared state. One-off actions (auto-fill, verify a doctor, re-check, watch) call `lib/api` straight from
the component that owns them.

- `src/app/` screens. Every file is a tab, `_layout.tsx` is the tab bar
- `src/components/` reusable pieces: form, live feed, clinic card, sheets, map
- `src/state/AppState.tsx` puts the shared hooks together into one context, so a search keeps running when you switch tabs
- `src/hooks/` one job each:
  - `useMission` the live search stream, instant previews and "Load more" (a reducer, so every event is one pure update)
  - `useBackend` /health: online, public demo, email alerts, owner key
  - `useOpeningAlerts` banner + phone notification, polls for new alerts, each alert only once
  - `useSavedResults` offline: keeps the form and last results on the phone
  - `useWatchCount` the Watchdog badge
- `src/lib/` plain functions with no React: API client, types, clinic helpers (status, merge, coverage),
  storage, notifications (`notify.ts` on phones, `notify.web.ts` no-op on web), theme

Platform differences stay in `.web.tsx` / `.web.ts` files (map, notifications) instead of `if (web)` checks everywhere.

### Scaling notes

- The backend does the heavy work (agents, ranking, watchdog). The app never calls TinyFish or Gemini, and no
  secret keys are ever in the app (`EXPO_PUBLIC_` values are visible to anyone)
- Searches reuse saved clinics: only out-of-date ones are re-checked, "Load more" checks only new ones,
  and the re-rank sends at most 30 (open clinics first, then closest)
- Alert polling is one small indexed query per phone per minute, only while the app is open and an email is set.
  Past a few thousand users this should move to push notifications (Expo push / FCM) from the backend's watchdog
- Email alerts go out on a 2-worker pool with retries on rate limits, so a clinic with many watchers can't flood Resend
- The backend uses SQLite, which is fine for one server. Running several servers would mean moving to Postgres

## What it has (same features as the website)

- Find: search form, live agent feed, map with status pins (tap a pin to jump to its card), ranked clinic cards,
  call scripts, Auto-fill waitlist (stops before Submit, you review it), Verify doctor (CPSO), Re-check, Watch clinic
- Watchdog: your watch list, Check all now, stop watching, recent alerts, Simulate opening (demo)
- Opening alert banner, watch count badge on the Watchdog tab, dot on the Find tab while a search runs
- How it works: the four agents, reading results, privacy + safety, FAQ, owner key for the public deployment
- `carescout://find?demo=1` (or `/find?demo=1` on web) starts the demo search
- Instant results: saved clinics from `GET /api/clinics` show up right away (faded, "from earlier checks") while the agents confirm them
- Load 5 more clinics: checks only clinics that aren't on screen yet (`clinic_urls`), then re-ranks the whole list with `POST /api/rank`
- Coverage filter on results: All / Takes OHIP / Without OHIP (UHIP, IFHP, uninsured, private pay), based only on what
  each clinic's website says
- Wait times: a clinic's own posted wait ("Waitlist is about 6 months") shows on its card. Never estimated
- Auto-fill has an optional "Reason for your visit" box (max 500). It only goes into a form box made for it and is never saved on the phone
- Email opening alerts (needs RESEND_API_KEY on the backend): Watchdog says "we'll also email you" when it's on
- Health Care Connect card after results (louder when nothing is accepting) and on How it works: link to ontario.ca and Call 811

## Phone-only extras

- Use my location: fills in your city + postal code from GPS (iOS/Android only)
- Directions: opens Apple Maps / Google Maps to the clinic
- Call-back reminders: "Lines open Monday at 9:00 AM. Remind me?" opens the phone's own new-event screen, filled in
- Share a clinic through the share sheet (copies it on web)
- Phone notifications when a watched clinic opens: turn on in Watchdog. With an email set, the app checks for new alerts
  every minute while open and when you come back to it. Tapping one opens Watchdog. The sparkle (simulate) sends one
  3 seconds later, so you can leave the app and watch it arrive. In Expo Go nothing is checked while the app is fully closed
  (that would need a dev build + push)
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
