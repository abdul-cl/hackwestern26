# Project Overview
- **Name:** CareScout — Autonomous Family Doctor & Clinic Hunter for Ontario
- **Goal:** An AI employee that hunts across real, public clinic websites in London, Ontario to find family doctors accepting new patients, ranks them by patient preferences, auto-fills public waitlist/intake forms (stopping before final Submit for human-in-the-loop safety), and watches full clinics for status changes.
- **Target Prizes:** Hire Your First AI Employee (TinyFish), Best Health Hack (Sun Life), Best Use of Gemini API, Best Use of Entire.

# Tech Stack & Folder Ownership (Strict)
- `backend/` — Owned by Abdul. Python FastAPI + Uvicorn (port 8000), TinyFish Python SDK (`tinyfish`) for live browsing/form-filling/monitoring, Google Gemini API (`google-genai`) for parsing & ranking clinic policies.
- `frontend/` — Owned by Ayush. React / Next.js / Vite dashboard with clean healthcare UI, patient profile form, live streaming agent activity feed, clinic status cards (Accepting / Waitlist Open / Not Accepting), and an Auto-Fill Waitlist preview modal.
- `frontend/` is now the **website** (React + Vite + Tailwind), built in Abdul's sessions with Ayush's OK; Ayush is building the mobile app variant separately.
- **Strict rule:** Neither person's Claude session edits files inside the other person's folder without asking.

# Commands
- Backend run: `cd backend && uvicorn app.main:app --reload --port 8000`
- Backend tests (no network, no API credits, ~1 min): `python backend/tests/run_all.py`
- Deploy: see `DEPLOY.md` (website on Vercel from `frontend/`, API on Railway/Render from `backend/`; config in `frontend/vercel.json`, `backend/railway.json`, `backend/Procfile`, `backend/.python-version`, `render.yaml`).
- Frontend run: `cd frontend && npm install && npm run dev` (http://localhost:5173; needs Node.js LTS). Build check: `cd frontend && npm run build`.
- Frontend backend URL: `frontend/src/config.js` (default `http://localhost:8000`), or override with `frontend/.env.local` → `VITE_API_URL=...` (and `VITE_API_KEY=...` if backend auth is on).

# Backend File Map (`backend/app/`)
Each feature is its own module with its own `router`; `main.py` only wires them together. Modules call each other as `module.name` (e.g. `scanning.scan_one`, `config.SCAN_TIMEOUT`), so tests patch the owning module.
- `main.py` — app setup only: auth (`X-API-Key`), CORS, catch-all JSON errors, lifespan (background watchdog), `/health`, `include_router` for every feature.
- `config.py` — `.env` loading, paths, all settings/timeouts/limits, default London URLs, `require_key`, TinyFish + Gemini client factories.
- `models.py` — every request/response Pydantic model (with the size caps).
- `common.py` — shared helpers: URL check, Gemini JSON parsing, SSE formatting + keep-alives, failed-clinic helpers.
- `cache.py` — `fallback_cache.json` load/merge/save.
- `clinic_db.py` — **clinic database** (SQLite table `clinics` in `clinics.db`): every known clinic, its details, latest availability, `last_checked`, page fingerprint; seeded from `backend/seed_clinics.json` on startup when empty. **One entry per clinic website per city** (`site_key`): another page of a site we already track is never added, and searches show the best page of each site. Doctor directories (`common.is_directory_url`, e.g. LDAM) are never stored or shown as clinics.
- `refresh.py` — quick re-checks: fetch the page → skip if its text is unchanged → Gemini reads it (its evidence quote must really be on the page) → TinyFish browser agent only as fallback; Watchdog alerts on status change; background refresher loop. Every page fetch refuses non-public addresses (localhost, private networks, cloud metadata), redirects included. One check per clinic at a time (a second caller waits, then usually finds it unchanged). The refresher waits one interval before its first batch, checks one clinic at a time, and uses no browser agents while a patient's search is running (`agents.searches_running()`).
- `clinics_api.py` — `GET /api/clinics`, `GET /api/clinics/stats`, `POST /api/clinics/refresh`, `POST /api/clinics/seed`.
- `agents.py` — TinyFish agent limiter (`TINYFISH_MAX_AGENTS`) + timeouts for all agent calls.
- `geo.py` — Nominatim geocoding (cache, rate limit, circuit breaker), address clean-up, distance.
- `scanning.py` — `POST /api/scan`, `POST /api/scan/stream`, scan prompt, geocoding attach.
- `discovery.py` — `POST /api/discover`.
- `llm.py` — `generate_json(prompt, schema)`: every Gemini JSON call, with retries + backup models on overload.
- `ranking.py` — `POST /api/rank` (Gemini prompt).
- `apply_form.py` — `POST /api/apply` (human-in-the-loop form fill).
- `cpso.py` — `POST /api/verify-doctor`.
- `orchestrator.py` — `POST /api/mission/stream` (+ demo replay of `backend/demo_mission.json`).
- `backend/record_demo.py` — records one real live search into `backend/demo_mission.json` (run against a local backend with both keys).
- `watch_api.py` — all `/api/watch*` endpoints + background auto-check loop.
- `watchdog.py` — SQLite storage for watches and alerts (no FastAPI code). Same `clinics.db` file as `clinic_db.py`, in `DATA_DIR`.
- New endpoint? Add it to the matching module (or a new module with `router = APIRouter()` + `app.include_router(...)` in `main.py`), its models to `models.py`, settings to `config.py`, and tests to `backend/tests/`.

# API Contract (Source of Truth)
- **Errors (all endpoints):** failures are always JSON `{ "detail": "string" }`. `401` = missing/wrong `X-API-Key` (only when auth is on), `422` = invalid request body (incl. oversized lists/strings), `500` = missing/placeholder API key (`TINYFISH_API_KEY` / `GEMINI_API_KEY`) or unexpected server error (details only in the backend log), `502` = Gemini failed in `/api/rank` (after its retries and backup model).
- **Security settings (backend `.env`, all optional):**
    - `CARESCOUT_API_KEY` — if set, every `/api/*` request must send header `X-API-Key: <value>` (frontend: put it in a Vite/Next env var). Unset = no auth (local dev). `/health` is always open.
    - `ALLOWED_ORIGINS` — comma-separated extra frontend origins for CORS (e.g. a deployed URL). By default only `http://localhost:*` and `http://127.0.0.1:*` are allowed.
    - `DISABLE_DOCS=1` — hides `/docs`, `/redoc`, `/openapi.json` (use when hosting publicly).
    - `WATCHDOG_INTERVAL_MIN` (default `0` = off) — background re-check of all watched clinics every N minutes; alerts go to `GET /api/watch/alerts`.
    - `TINYFISH_MAX_AGENTS` (default `2`, our TinyFish plan's limit) — how many TinyFish agents run at once across scan, stream, apply and watch checks. Extra work waits in a queue; per-clinic timeouts only start once its agent starts.
    - `SCAN_TIMEOUT_S` (default 180) / `APPLY_TIMEOUT_S` (default 120) / `VERIFY_TIMEOUT_S` (default 45) — per-agent time limits.
    - `PUBLIC_DEMO=1` — public deployment mode: visitors only get saved results (scan / stream / mission are forced to `use_cache`; `503` if `fallback_cache.json` is missing), `/api/apply`, `/api/verify-doctor`, `/api/discover`, `/api/watch/check` return `403`, and POSTs are rate-limited per visitor (`PUBLIC_RATE_LIMIT`, default 30 per 10 min, `429`). Requests with header `X-Admin-Key: <CARESCOUT_ADMIN_KEY>` skip all of this.
      - Public demo writes are locked down: a mission's `clinic_urls` are ignored (never stored); watchlists only work for the shared demo account `demo@carescout.ca` (`config.DEMO_EMAIL`): `POST`/`DELETE /api/watch` and `GET /api/watch` / `/api/watch/alerts` with any other `user_email` are `403`, `POST /api/watch` only accepts clinics already in the database, `simulate-opening` only touches demo watches, and missions only auto-watch for the demo email (others get "Watchdog skipped (watchlists use the demo account on the public demo)").
    - `CARESCOUT_ADMIN_KEY` — server-side secret that unlocks live agents in public mode (website: `localStorage.carescout_admin_key`, see DEPLOY.md). Never put it in a `VITE_` variable.
    - `ALLOWED_ORIGIN_REGEX` — extra CORS pattern, e.g. Vercel preview URLs `https://carescout-[a-z0-9-]+\.vercel\.app`.
    - `DATA_DIR` (default `backend/`) — folder for `clinics.db`. On Railway/Render point it at a persistent volume (e.g. `/data`) so the clinic database and watches survive redeploys.
    - `FRESH_HOURS` (default 12) — a clinic checked within this many hours is shown from the database without re-checking.
    - `MAX_STATUS_AGE_DAYS` (default 7) — availability older than this is **expired**: kept in the database but returned with `expired: true` and shown as "Needs a re-check" (last-seen status), never as current; not counted as accepting/closed, not auto-watched, ranked low.
    - `DEAD_AFTER_DAYS` (default 30) + `DEAD_MIN_FAILS` (default 3) — a clinic whose website has failed every check for that long is hidden from searches (not deleted; the refresher still retries it last, and one good check brings it back).
    - `REFRESH_INTERVAL_MIN` (default `0` = off) — background job re-checking the most out-of-date clinics every N minutes (`REFRESH_BATCH`, default 20 per run; `REFRESH_ALLOW_AGENT=0` to never use browser agents there). Status changes fire Watchdog alerts.
    - `GEMINI_MODEL` (default `gemini-3.1-flash-lite`) — main model for every Gemini call (`gemini-2.5-flash` is closed to new keys; `3.6-flash` / `3.5-flash` / `3.8-flash` were slow or hung in testing).
    - `GEMINI_FALLBACK_MODELS` (default `gemini-3.5-flash-lite`, comma-separated) + `GEMINI_RETRIES` (default 2) — when Gemini answers 503 "high demand" / 429 / times out, the call is retried once on `GEMINI_MODEL` and then tried on each backup model (`app/llm.py`, used by ranking, page reading and discovery). Other errors (bad key, invalid JSON) are not retried.
    - `TRUSTED_PROXY_HOPS` (default 1) — proxies in front of the API that append to `X-Forwarded-For` (Railway/Render: 1). The rate limit uses the address that many entries from the end, never the client-written first one.
    - `DEMO_REPLAY` (default `1`), `REPLAY_SPEED` (default 8), `REPLAY_MAX_GAP_S` (default 1.5) — demo / public-demo missions in the recorded city replay `backend/demo_mission.json` (a real live search; re-record with `python backend/record_demo.py`) for the Scout + Browser Swarm stages, sped up; ranking and the Watchdog still run live. Tests set `DEMO_REPLAY=0`.
    - `GEMINI_RPM` (default 12) — spacing for page-reading Gemini calls (free tier ~15/min). `CARESCOUT_SEED=0` skips loading `seed_clinics.json` into an empty database.
    - Run uvicorn without `--host 0.0.0.0` unless you mean to expose it on the network (hosts like Railway/Render need it; their start command sets it).
- **Size limits:** `clinic_urls` ≤ 20 after dedup, `clinics` (rank) ≤ 30, `preferences` ≤ 20, `city` ≤ 100 chars, patient fields capped (name 120, email 200, phone 40, postal_code 12).
- `POST /api/scan`
    - Request: `{ "city": "London, ON", "preferences": ["string"], "clinic_urls": ["string"], "use_cache": false, "user_postal_code": "N6A 3K7" }` (`city` is used as a geocoding fallback; `preferences` is accepted but not used yet; `clinic_urls` empty = the 5 London defaults, max 20; `use_cache` defaults to `false`; `user_postal_code` is optional, default `null`)
    - Response (JSON):
      `{ "clinics": [{ "name": "string", "url": "string", "status": "accepting | waitlist | closed", "evidence_quote": "string", "waitlist_url": "string | null", "raw_notes": "string", "address": "string | null", "lat": 0.0, "lng": 0.0, "distance_km": 0.0 }] }`
    - **Map fields** (every clinic always has these keys; any of them can be `null`):
      - `address`: street address as shown on the clinic's site (null if not visible).
      - `lat` / `lng`: from OpenStreetMap Nominatim, trying the full `address`, then the address without its unit/suite number, then the postal code in the address (approximate pin), then "clinic name, city". Only Ontario matches are accepted. Skip the map pin when null.
      - `distance_km`: km from `user_postal_code` (straight line, 1 decimal). Null if no/invalid postal code, or the clinic has no `lat`/`lng`. Needs a FULL postal code (`N6A 3K7`, `n6a3k7` also OK); partial codes like `N6A` are ignored.
      - Geocoding is fail-safe: if OpenStreetMap is slow/down/offline these stay `null` and the scan still succeeds. Lookups are rate-limited to 1/second (Nominatim policy), so adding locations can add a few seconds.
    - A browser-agent answer must have a known status AND a quote from the page; otherwise it's a failed scan (`scan failed: the agent couldn't tell...` / `...gave no quote...`), never `closed`.
    - A clinic whose scan failed or timed out (180s each, counted from when its agent starts) does NOT break the scan: it comes back with `status: "closed"` and `raw_notes` starting with `scan failed:` or `scan error:`. Show it as "couldn't check" in the UI.
    - `use_cache: true` returns `backend/fallback_cache.json` instantly; if that file is missing or corrupted it silently does a live scan. The cache is only updated by scans of the default London list: clinics that scanned cleanly replace their entry, clinics that failed keep their previous good entry, and it is never saved smaller than before (so a bad scan can't wipe the backup).
- `POST /api/scan/stream` (SSE, for the live agent activity feed)
    - Request: same body as `/api/scan` (`city`, `preferences`, `clinic_urls`, `use_cache`, `user_postal_code`). Each `clinic_result` includes the same map fields (`address`, `lat`, `lng`, `distance_km`).
    - Response: `text/event-stream`. Each message is `data: <json>` followed by a blank line. Clinics scan in parallel, so results arrive in any order:
      - `{ "type": "status", "url": "string", "message": "Queued: waiting for a free agent..." }` (sent for every clinic right away)
      - `{ "type": "status", "url": "string", "message": "Agent started scanning..." }` (sent when its agent actually starts; at most 2 run at once)
      - `{ "type": "clinic_result", "clinic": { ...same clinic object as /api/scan... } }` (one per clinic, as soon as it finishes)
      - `{ "type": "done", "total": 5 }` (last event; always sent, even if some clinics failed or timed out)
      - Failed clinics arrive as a normal `clinic_result` (see `/api/scan`). A line starting with `:` is a keep-alive comment; ignore it.
    - It is a POST, so use `fetch` + `response.body.getReader()` (not `EventSource`). With `use_cache: true` it replays `backend/fallback_cache.json` instantly.
- `POST /api/discover` (find clinic websites for a city; feed the result into `/api/scan`)
    - Request: `{ "city": "London, ON", "max_results": 5 }` (both optional; `max_results` is clamped to 1-20)
    - Response: `{ "city": "London, ON", "clinic_urls": ["https://..."] }` (clean, deduplicated https URLs; no Yelp/Reddit/Facebook/RateMDs). TinyFish searches the web, then Gemini filters the results to real family clinics in that city (Gemini search grounding has no quota on our key). Usually 3-8s.
    - If it fails or finds nothing for London, it returns our 5 default London URLs. For other cities the list may be empty.
- `POST /api/rank`
    - Request: `{ "preferences": ["string"], "clinics": [...], "language": "English", "coverage_type": "OHIP" }`
      - `clinics` is required (pass the `/api/scan` clinic objects); an empty list returns `{ "ranked_clinics": [] }` immediately. `preferences`, `language` and `coverage_type` are optional (defaults shown). Suggested dropdowns: language = English, French, Arabic, Mandarin, Punjabi; coverage_type = OHIP, UHIP, Uninsured.
    - Response:
      `{ "ranked_clinics": [{ "name": "string", "url": "string | null", "score": 0, "reason": "string", "requirements": ["string"], "next_step": "string", "coverage_tags": ["string"], "phone_number": "string | null", "call_hours": "string | null", "call_script": "string | null" }] }`
      - Phone-only clinics: `phone_number` / `call_hours` are pulled from the scan notes (null if the clinic didn't list them; never invented). `call_script` is only filled when the clinic's `waitlist_url` is null: 2-3 sentences the patient reads out **in English** (French if `language` is French), one per line, each followed by a line `(meaning: ...)` in the requested `language`; then a blank line, a `Have ready:` heading and a short checklist in the requested language. Render line by line (the website's `CallScript` tags "say" vs "meaning" lines with `lang` and `dir="auto"`, and also handles a translation in brackets on the same line), plus a "Call" button using `tel:` on `phone_number`.
      - `reason`, `requirements`, `next_step` are written in the requested `language`. `name` and `coverage_tags` stay in English.
      - `coverage_tags` are badges for the UI, e.g. `["OHIP", "Nurse Practitioner"]`, `["UHIP Friendly"]`, `["Check Eligibility"]` (use the last one when the clinic's notes don't say). May be empty.
      - Clinics matching the coverage type / language are ranked higher, and closer ones (by `distance_km`) when other factors are similar. Results are sorted by `score`, best first.
      - `url` is the matching input clinic's `url` (filled by the backend from your data, never invented; null only if the model renamed a clinic beyond recognition). Use it to join with scan results.
      - Clinics whose scan failed get score 10 and a reason saying their status couldn't be checked (never "closed").
- `POST /api/apply`
    - Request: `{ "waitlist_url": "string", "patient_info": { "name": "string", "email": "string", "phone": "string", "postal_code": "string" } }`
    - Response (always HTTP 200 with this shape once the request is valid):
      `{ "status": "ready_for_review | manual_required | error", "filled_fields": {}, "summary": "string", "screenshot_url": "string | null" }`
      - `ready_for_review`: fields were filled and the agent stopped BEFORE Submit; show the preview modal.
      - `manual_required`: blocked form / captcha / login / no form found / agent failed or took over 120s. `summary` says why and links the page; tell the user to finish it manually.
      - `error`: unexpected failure, OR the agent reports the form was actually submitted (guardrail breach). `summary` says which; show it prominently.
    - `422` if `waitlist_url` is not an `https://` URL (patient data is never sent to plain http pages).
    - The agent is told to treat page text as data (prompt-injection hardening). The no-Submit rule is still enforced by the agent's instructions, not by code, so always keep the human review step.

- `POST /api/mission/stream` (**flagship**: the whole pipeline in one live SSE stream, for the "Mission Control" dashboard)
    - Request (all optional):
      `{ "city": "London, ON", "user_postal_code": null, "preferences": [], "language": "English", "coverage_type": "OHIP", "user_email": null, "auto_watch_closed": true, "use_cache": false, "clinic_urls": [], "max_clinics": 5, "refresh": "auto" }`
      - `max_clinics`: how many clinics this search includes, **1-25** (the user picks it; closest to `user_postal_code` first).
      - `refresh`: `"auto"` (default: clinics checked in the last `FRESH_HOURS` come straight from the database, the rest are re-checked live), `"all"` (re-check every clinic live), `"none"` (database only, like demo mode).
      - `clinic_urls`: if given, skips the database lookup / web search and checks these (max 20).
      - `use_cache: true` (demo mode; always on for the public demo): database only, nothing live, no TinyFish key needed; if the database has nothing saved for the city it replays `fallback_cache.json`. Ranking still calls Gemini (needs network). If `backend/demo_mission.json` exists for the city (and `refresh` isn't `"none"`), the Scout + Browser Swarm stages are instead a sped-up **replay of that real recorded search**: the stream starts with `{ "type": "replay", "recorded_at": "ISO", "speed": 8 }`, then the recorded `stage` / `discovered` / `agent_status` / `clinic_scanned` events (distances recomputed for this visitor, expiry recomputed), then live ranking and watch.
    - Pipeline: Scout (clinic database; web search via `/api/discover` logic only when the database has fewer than `max_clinics` for the city) → re-check what's out of date (quick page read + Gemini, TinyFish browser agent only as fallback, max 2 agents at once) + geocoding → Triage Agent (`/api/rank` logic, Gemini) → Watchdog auto-enroll. Every result is saved to the database.
    - SSE events (`data: <json>` + blank line; `:` lines are keep-alives, ignore them), in this order:
      - `{ "type": "stage", "stage": "discover", "message": "Scout Agent looking for clinics in London, ON..." }` (more `discover` stage messages may follow, e.g. "Found 12 clinics in the CareScout database.")
      - `{ "type": "discovered", "urls": ["https://..."] }` (London never ends up empty: falls back to the 5 defaults)
      - `{ "type": "stage", "stage": "scan", "message": "3 clinics are up to date; checking 2 clinic websites..." }`
      - `{ "type": "agent_status", "url": "string", "message": "string" }` per clinic: `"Up to date (checked 3 h ago)"` (from the database, instant), or live progress: `"Reading the clinic's website..."`, `"Following the clinic's new-patient link..."`, `"Quick read didn't work; waiting for a browser agent..."`, `"Agent started scanning..."`.
      - `{ "type": "clinic_scanned", "clinic": { ...Clinic, same as /api/scan incl. address/lat/lng/distance_km, plus last_checked / checked_via... } }` (one per clinic, any order)
      - `{ "type": "stage", "stage": "rank", "message": "Gemini Triage Agent ranking & translating results..." }`
      - `{ "type": "ranked", "ranked_clinics": [ ...same as /api/rank... ] }`
      - `{ "type": "stage", "stage": "watch", "message": "..." }` then `{ "type": "watched", "count": 2, "clinics": [ <watch record>, ... ] }` (only if `auto_watch_closed` and `user_email`; otherwise just a `stage` event saying "Watchdog skipped (...)")
      - `{ "type": "error", "stage": "discover | rank | watch | mission", "message": "string" }` (a stage failed; the mission continues)
      - `{ "type": "done", "summary": { "total_scanned": 5, "accepting_count": 1, "waitlist_count": 1, "closed_count": 2, "failed_count": 1, "watched_count": 2, "ranked": true, "top_clinic": "string | null", "duration_s": 95.3, "from_database": 3, "rechecked": 2, "expired_count": 0, "replay_recorded_at": "ISO | null" } }` (ALWAYS the last event; accepting/waitlist/closed counts exclude expired clinics; `replay_recorded_at` is set when stages 1-2 were a replay)
    - Only clinics that scanned successfully as `closed` are auto-watched (a failed scan is not "closed"). Re-running never duplicates watches.
    - `422` for a bad `user_email` / too many `clinic_urls` / oversized lists; `500` before the stream starts if the server's TinyFish key is missing (live mode).
    - Timing: clinics fresh in the database are instant; quick re-checks take a few seconds each; only sites that need a browser agent take 1-3 min each (2 at a time). Demo mode is a few seconds in total (just ranking).
- `POST /api/verify-doctor` (check a doctor on the official CPSO public register, https://doctors.cpso.on.ca/)
    - Request: `{ "doctor_name": "Jane Smith", "city": "London" }` (`doctor_name` 2-100 chars, a leading "Dr." is ignored; `city` optional, default `"London"`)
    - Response (always HTTP 200 with this shape once the request is valid):
      `{ "verified": false, "cpso_number": "string | null", "registration_status": "string | null", "specialty": "string | null", "languages": ["string"], "gender": "string | null", "profile_url": "string | null", "notes": "string", "lookup_status": "found | not_found | timeout | error" }`
      - `verified` is true ONLY when a matching profile was found AND its registration status is active (checked by the backend, not just the agent's word).
      - `lookup_status`: `found` (profile found; `verified` may still be false if inactive), `not_found`, `timeout` (took over 45s once its agent started), `error` (site blocked / agent failed). `notes` always explains, and links the register for manual search when it didn't work.
      - `profile_url` is only ever a `https://doctors.cpso.on.ca/...` link. `cpso_number` is digits only. `languages` may be `[]`.
      - Uses one TinyFish agent (shares the 2-agent limit with scans). Found results are cached in memory for 1 hour, so repeat lookups are instant.
    - `422` for a missing/too-short `doctor_name`; `500` only if the server's TinyFish key is missing.
- **Clinic database endpoints** (`clinics_api.py`). Extra fields on Clinic objects from the database / mission: `"last_checked": "2026-11-21T14:03:00Z | null"`, `"checked_via": "page | agent | saved | null"` (page = quick read of the clinic's website, agent = TinyFish browser agent, saved = seed / demo data), `"expired": false` (true = `status` is only the last-seen value, older than `MAX_STATUS_AGE_DAYS`), `"status_age_days": 0.4`.
- `GET /api/clinics?city=London, ON&postal_code=N6A 3K7&limit=25&include_unchecked=false`
    - Response: `{ "city": "string", "clinics": [ <Clinic + last_checked / checked_via, distance_km if postal_code> ], "stats": <stats> }`, closest first (accepting first without a postal code). Instant; allowed on the public demo.
- `GET /api/clinics/stats` → `{ "total": 40, "checked": 36, "fresh": 30, "expired": 2, "hidden_dead": 1, "by_status": { "accepting": 9, "waitlist": 7, "closed": 20 }, "cities": ["London, ON"], "last_refresh": "ISO | null" }`
- `POST /api/clinics/refresh` `{ "url": "https://...", "city": "London, ON", "user_postal_code": null }` ("Re-check" button on a card)
    - Re-checks one clinic now (always re-reads, even if unchanged). Response: `{ "clinic": <Clinic>, "method": "unchanged | page | agent | failed", "status_changed": false, "error": "string | null" }`. On `failed` the last good result is returned when there is one. `403` on the public demo.
- `POST /api/clinics/seed` `{ "city": "London, ON", "max_new": 10 }` → web search for more clinics in that city (1-20); new ones are added and checked in the background. Response `{ "city", "added": [...], "found": [...], "total": 41 }`. `403` on the public demo.
- **Clinic Watchdog** (code in `backend/app/watchdog.py`; data in `backend/clinics.db`, SQLite, git-ignored, survives restarts). A watch record is
  `{ "id": 1, "clinic_name": "string", "url": "string", "last_status": "accepting | waitlist | closed", "user_email": "string", "created_at": "2026-11-21T14:03:00Z", "last_checked": "2026-11-21T14:10:00Z | null" }`
  (timestamps are UTC ISO-8601; `last_checked` is null until the first successful check).
- `POST /api/watch` ("Watch Clinic" button)
    - Request: `{ "clinic_name": "string", "url": "string", "last_status": "accepting | waitlist | closed", "user_email": "string" }`
    - Response: the saved watch record (above). Watching the same `url` + `user_email` again updates that watch (name/status) instead of duplicating it, and keeps its `id` and `created_at`.
    - `422` if `last_status` isn't one of the three statuses, `url` isn't http(s), or `user_email` has no `@`.
- `GET /api/watch?user_email=you@example.com`
    - Response: `{ "watched_clinics": [ <watch record>, ... ] }`, newest first.
    - Pass `user_email` to get only that user's watches. Without it, all watches are returned with emails masked (`a***@gmail.com`).
- `POST /api/watch/check?user_email=you@example.com` ("Check Watchlist Now" button; no body)
    - Re-scans watched clinics in parallel with TinyFish (only that user's if `user_email` is given; slow: about as long as `/api/scan`). Saves new statuses and stamps `last_checked`.
    - Response: `{ "checked": 3, "failed": 0, "alerts": [ <alert>, ... ] }`. `alerts` only has clinics whose status changed (e.g. `closed` -> `accepting`). `failed` counts clinics whose scan errored; their status and `last_checked` are left unchanged.
    - Alert: `{ "id": 1, "clinic_name": "string", "url": "string", "user_email": "string", "old_status": "string", "new_status": "string", "evidence_quote": "string", "message": "string" }`. `user_email` is masked when `user_email` is omitted. `message` is ready to show, e.g. `"Good news: X is now accepting new patients (was closed). Act fast, spots fill quickly."`
- `POST /api/watch/simulate-opening` (**demo only**, for judging on stage)
    - Request (body optional): `{ "watch_id": 1 }` or `{}` / no body = the most recently added watch. On the public demo: only the demo account's watches (another watch_id is `404`).
    - Flips that watch to `accepting` in SQLite (and stamps `last_checked`) and returns `{ "alert": <alert> + "simulated": true }`, the same alert shape as `/api/watch/check`, with `user_email` always masked. If the clinic was already `accepting`, `old_status` is reported as `closed` so the demo can be repeated.
    - `404` if there are no watches or `watch_id` doesn't exist. Instant, uses no TinyFish credits.
- `GET /api/watch/alerts?user_email=you@example.com&limit=20` (alert feed / notification bell)
    - Response: `{ "alerts": [ <alert> + "alert_id": 7, "simulated": false, "created_at": "2026-11-21T14:10:00Z" ] }`, newest first. Every alert from `/api/watch/check`, the background auto-check and `simulate-opening` is stored here (note: `id` is the watch id, `alert_id` is the alert's own id).
    - Same email rule: pass `user_email` for that user's alerts (unmasked); without it all alerts with masked emails. `limit` 1-100, default 20.
    - Poll it (e.g. every 30s) to show new alerts even when they came from the background auto-check.
- `DELETE /api/watch/{watch_id}?user_email=you@example.com` ("Stop watching" button)
    - Response: `{ "deleted": true, "id": 3 }`. `404` if that watch doesn't exist or belongs to another email; `422` without `user_email`. Past alerts for it are kept.
- **Background auto-check (optional):** set `WATCHDOG_INTERVAL_MIN` in the backend `.env` (e.g. `30`) and the server re-checks every watched clinic on that timer by itself, storing any alerts in the feed above. Off by default (each check uses one TinyFish agent per watched clinic).

# Website File Map (`frontend/src/`)
- Pages (React Router, all inside `components/Layout.jsx` = nav + alert banner + footer): `/` `pages/HomePage.jsx` (landing page), `/find` `pages/FindPage.jsx` (search + results; `/find?demo=1` turns on Demo mode and launches), `/watchdog` `pages/WatchdogPage.jsx`, `/how-it-works` `pages/HowItWorksPage.jsx` (agents, results, `#safety`, FAQ), `*` `pages/NotFoundPage.jsx`.
- `state/AppState.jsx` — state shared across pages: search form, the running mission (keeps going while you browse), alert banner, Watchdog count. Use `useAppState()`.
- `config.js` — backend URL/key, form defaults, dropdown options, `DEMO_EMAIL` (demo searches and the public demo use it so full clinics get auto-watched). `api.js` — every backend call + the SSE stream reader (`streamPost`).
- `hooks/useMission.js` — runs `POST /api/mission/stream` and turns its events into UI state; `stop()` aborts. `hooks/useReducedMotion.js` — respect the OS "reduce motion" setting. `hooks/useFlip.js` — result cards glide to their new place when ranking reorders them. `hooks/useScrollProgress.js` — sets `--progress` (0-1) on an element as you scroll through it.
- `theme.js` — light / dark mode (`useTheme()`): follows the device setting until the person picks one (saved in `localStorage.carescout_theme`); `index.html` applies it before the first paint. `components/ThemeToggle.jsx` is the nav button (circular reveal via the View Transitions API).
- `lib/clinics.js` — pure helpers: failed-scan detection, status colors/labels, merging scan + rank results by `url`.
- Demo flow: `/find?demo=1` runs a demo search with `DEMO_EMAIL` → the feed shows "Replay of a real search" and ends with "See what the alert looks like" → `/watchdog?simulate=<watch id>` plays the opening alert. If ranking fails, a "Retry ranking" bar re-ranks the results on screen (`mission.retryRank`, `POST /api/rank`); cards only say "Ranking..." while it can still arrive.
- `components/`: `SiteNav`, `SiteFooter`, `Layout`, `Logo`, `ThemeToggle`, `NextSteps` ("No luck yet? Also try these": Health Care Connect via 811, London InterCommunity Health Centre, the LDAM list, Health811), Evidence quotes link to the clinic page with the sentence highlighted (`quoteLink`, `#:~:text=`), `Reveal` (fade/slide in once scrolled into view; `delay` staggers, `x`/`y` set the direction), `MissionForm`, `AgentFeed`, `ClinicMap`, `ClinicCard`, `ApplyModal`, `CallScript`, `VerifyDoctor`, `WatchdogView`, `AlertBanner`, `StatusBadge`, `ErrorBoundary`.
- `components/home/`: `HuntBoard` (hero animation, fictional example clinics), `FeatureDemos` (form-fill, multilingual call script, opening alert, CPSO examples). Home-page examples use made-up clinics and people on purpose; never put invented statuses next to real clinic names.
- Design tokens (`tailwind.config.js`, `index.css`): pine primary (`pine-*`, and `emerald-*` is remapped to it), `ink` #10231F text, `paper` #F7F9F8 background; fonts Bricolage Grotesque (`font-display`, headings) + Instrument Sans (body).
- **Dark mode:** every color family (`slate`, `pine`/`emerald`, `rose`, `amber`, `sky`, `stone`) and token is a CSS variable with a light and a dark value (both lists live in `tailwind.config.js`), so normal classes switch by themselves when `<html>` has `dark`. Don't use `bg-white` for panels: use `bg-surface`. Solid green with white text: `bg-brand` (`hover:bg-brand-hover`). Dark panels with white text: `bg-night`. Mint tint behind things: `bg-accent`. `white`, `black` and `mint` never switch (use them only on top of brand/night colors). Check new UI in both themes.
- **Motion:** the hero board animation; pages rise in on navigation; sections reveal once as they scroll in (`Reveal`); the home pipeline line and the How-it-works rail draw as you go; on /find the stage line fills, cards slide in and glide into ranked order, score rings fill, panels grow open. Use the `ease-flow` curve and the existing `animate-*` names (`card-in`, `page-in`, `sheet-in`, `row-in`, `pop-in`, `slide-down`). Reduced motion is respected globally (CSS) and in `Reveal`/`useFlip`/theme switch.

# Frontend Integration Notes (for Ayush / frontend Claude sessions)
Read this before writing any code that calls the backend. The API Contract above is the source of truth; this section is how to use it. Don't edit `backend/` — ask Abdul if something is missing.

## Setup
- Backend base URL: `http://localhost:8000` (put it in an env var, e.g. `VITE_API_URL` / `NEXT_PUBLIC_API_URL`). Check it's up with `GET /health` → `{ "status": "ok", "public_demo": false }`. When `public_demo` is true the site is a public deployment: only saved results, and the website disables Auto-Fill / Verify Doctor / Check All Now with an explanation.
- Run the frontend on `localhost` or `127.0.0.1` (any port). Other origins are blocked by CORS unless Abdul adds them to `ALLOWED_ORIGINS`.
- Auth is OFF by default. If Abdul turns it on, send header `X-API-Key: <value>` on every `/api/*` call (read it from an env var, never hard-code it).
- Interactive API docs (try every endpoint): `http://localhost:8000/docs`.

## Main user flow
1. (Optional) `POST /api/discover { city }` → `clinic_urls`. For London, skip it and send `clinic_urls: []` to use the 5 curated defaults.
2. `POST /api/scan/stream { clinic_urls, user_postal_code }` → live activity feed + clinic cards + map pins as each clinic finishes. (`POST /api/scan` is the same data in one JSON response, no live updates.)
3. When the stream sends `done`: `POST /api/rank { clinics, preferences, language, coverage_type }` → scores, reasons, badges, call scripts.
4. Clinic with `waitlist_url` → "Auto-Fill Waitlist" button → `POST /api/apply` → review modal.
   Clinic without `waitlist_url` → show `phone_number`, `call_hours` and `call_script` with a `tel:` Call button.
5. "Watch Clinic" → `POST /api/watch`; "Check Watchlist Now" → `POST /api/watch/check?user_email=...`; "Stop watching" → `DELETE /api/watch/{id}?user_email=...`; notification bell → poll `GET /api/watch/alerts?user_email=...`.
6. "Verify doctor" (e.g. on a clinic card, or a search box): `POST /api/verify-doctor { doctor_name, city }` → show a "CPSO verified" badge only when `verified` is true, plus specialty/languages and a link to `profile_url`.
7. Demo: a hidden/dev "Simulate opening" button → `POST /api/watch/simulate-opening` (no body) → show the returned `alert` the same way as a real check alert (toast/banner). Don't show it to real users.

## TypeScript types (match the backend exactly)
```ts
type ClinicStatus = "accepting" | "waitlist" | "closed";
interface Clinic {            // from /api/scan and /api/scan/stream
  name: string; url: string; status: ClinicStatus;
  evidence_quote: string; waitlist_url: string | null; raw_notes: string;
  address: string | null; lat: number | null; lng: number | null; distance_km: number | null;
  last_checked?: string | null; checked_via?: "page" | "agent" | "saved" | null;   // from the database / mission
  expired?: boolean; status_age_days?: number | null;   // expired: status is last-seen only -> show "Needs a re-check"
}
interface RankedClinic {      // from /api/rank (no lat / lng: join to Clinic by `url`)
  name: string; url: string | null; score: number; reason: string; requirements: string[]; next_step: string;
  coverage_tags: string[]; phone_number: string | null; call_hours: string | null; call_script: string | null;
}
type StreamEvent =
  | { type: "status"; url: string; message: string }
  | { type: "clinic_result"; clinic: Clinic }
  | { type: "done"; total: number };
interface ApplyResult {
  status: "ready_for_review" | "manual_required" | "error";
  filled_fields: Record<string, unknown>; summary: string; screenshot_url: string | null;  // render values with String(v)
}
interface DoctorVerification {  // from /api/verify-doctor
  verified: boolean; cpso_number: string | null; registration_status: string | null; specialty: string | null;
  languages: string[]; gender: string | null; profile_url: string | null; notes: string;
  lookup_status: "found" | "not_found" | "timeout" | "error";
}
interface Watch { id: number; clinic_name: string; url: string; last_status: ClinicStatus; user_email: string;
  created_at: string; last_checked: string | null }            // GET /api/watch -> { watched_clinics: Watch[] }
interface WatchAlert { id: number; clinic_name: string; url: string; user_email: string;
  old_status: ClinicStatus; new_status: ClinicStatus; evidence_quote: string; message: string;
  simulated?: boolean;                                          // simulate-opening -> { alert: WatchAlert }
  alert_id?: number; created_at?: string }                       // GET /api/watch/alerts -> { alerts: WatchAlert[] }
```

## Reading the SSE stream (it's a POST, so not `EventSource`)
```ts
async function scanStream(body: object, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) {
  const res = await fetch(`${API}/api/scan/stream`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw new Error((await res.json()).detail);   // 401 / 422 / 500 come back as normal JSON
  const reader = res.body!.getReader(); const decoder = new TextDecoder(); let buf = "";
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n"); buf = parts.pop()!;      // keep the incomplete tail
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;               // ":" lines are keep-alives
      onEvent(JSON.parse(part.slice(6)));
    }
  }
}
```
- Abort with an `AbortController` when the user leaves the page or rescans; the backend stops waiting and drops the results (agents already running on TinyFish finish on their side, so don't spam rescans: it still uses credits).
- Results arrive in any order. `done` is always the last event, even if clinics failed.

## Mission Control dashboard (`POST /api/mission/stream`)
- Read it with the same `fetch` reader as `/api/scan/stream` (it's a POST). Event types:
```ts
type MissionEvent =
  | { type: "stage"; stage: "discover" | "scan" | "rank" | "watch"; message: string }
  | { type: "discovered"; urls: string[] }
  | { type: "agent_status"; url: string; message: string }
  | { type: "clinic_scanned"; clinic: Clinic }
  | { type: "ranked"; ranked_clinics: RankedClinic[] }
  | { type: "watched"; count: number; clinics: Watch[] }
  | { type: "error"; stage: string; message: string }
  | { type: "done"; summary: { total_scanned: number; accepting_count: number; waitlist_count: number; closed_count: number;
      failed_count: number; watched_count: number; ranked: boolean; top_clinic: string | null; duration_s: number;
      from_database: number; rechecked: number; expired_count: number } };
```
- Suggested layout: a 4-step progress bar driven by `stage` events (Scout → Browser Swarm → Triage → Watchdog); an agent log fed by every `message`; one tile per URL from `discovered` that goes Queued → Scanning → result via `agent_status` / `clinic_scanned`; map pins appear as `clinic_scanned` arrives; the ranked list replaces the tiles on `ranked`; a "Watching N full clinics for openings" banner from `watched`; final stats from `done.summary`.
- `error` events are non-fatal: show them in the log (e.g. if ranking fails, keep showing the unranked scan results). Only stop the spinner on `done`.

## Rendering rules
- **Failed scans:** a clinic whose `raw_notes` starts with `scan failed` or `scan error` is NOT really closed. Show it as "Couldn't check: visit site" with a link to `url`. Its `name` is just the URL.
- **Status badges:** `accepting` → Accepting, `waitlist` → Waitlist Open, `closed` → Not Accepting. Show `evidence_quote` as the "why".
- **Expired results:** when `expired` is true, show "Needs a re-check" (grey) instead of the status, plus "Last seen: <status>, N days ago" from `status` / `status_age_days`. Never present it as current.
- **Map:** any library works (e.g. Leaflet / react-leaflet with OpenStreetMap tiles; tiles need attribution "© OpenStreetMap contributors"). Only add pins where `lat` and `lng` are not null; list clinics without coordinates beside the map. Show `distance_km` as "x.x km away" when not null; it's straight-line, not driving distance.
- **Postal code input:** must be a full code like `N6A 3K7` for distances. Partial codes are silently ignored (no error, just no distances).
- **Rank:** sort is already done (best first). Join to scan results with `ranked.url === clinic.url` (fallback: same `name`); if no match, show the ranked card without map data. `reason` / `requirements` / `next_step` / `call_script` are in the chosen language; `coverage_tags` are English badges.
- **Call script:** render `call_script` with line breaks preserved (`white-space: pre-line`). Call button: `<a href={"tel:" + phone_number}>`. Hide the button when `phone_number` is null.
- **Apply modal (human-in-the-loop, required):**
  - `ready_for_review`: show `filled_fields` + `summary` (+ `screenshot_url` image if present) and tell the user to open the clinic page to review and press Submit themselves. Never say "submitted".
  - `manual_required`: show `summary` (it explains why and contains the link) and a button to open the waitlist page.
  - `error`: show `summary` prominently (red). It may be a guardrail warning that the form was submitted.
  - `waitlist_url` must be `https://` or you get a 422.
- **Watchlist:** always pass `?user_email=` (from the patient profile) to `GET /api/watch` and `POST /api/watch/check`; without it emails are masked and you see everyone's watches. The list key is `watched_clinics` (newest first); show `last_checked` as "checked x min ago" or "not checked yet" when null.

## Timing / loading states
- Scan: only 2 TinyFish agents run at once, so 5 clinics take ~3-6 min total (each ~40-150s on real sites, measured; + a few seconds for map lookups). For live demos prefer `use_cache: true`. Show "Queued" from the first `status` event, a spinner after "Agent started scanning...", until its `clinic_result`.
- Apply: up to 120s once its agent starts, and it waits for a free agent if a scan is running (so disable "Auto-Fill" or show "Waiting for a free agent" during scans). Rank: ~2-10s (longer when Gemini is overloaded and the backend retries / switches to the backup model). Discover: ~3-8s. Verify doctor: up to ~45s (instant if looked up in the last hour). Watch check: as long as a scan.
- Demo / no Wi-Fi: send `use_cache: true` to scan or stream for an instant replay of the saved London results. Distances still need network to look up the postal code.

## Errors
- Every error is JSON `{ "detail": string }`: 401 bad/missing API key, 422 bad input (show `detail`), 500 backend problem (missing API key on the server etc.), 502 Gemini failed in rank even after the backend's retries and backup model (offer a retry). Rank failing shouldn't block showing scan results.

# Rules for Claude
- Keep code flat, simple, and easy to debug.
- Never read, print, or commit `.env` files. Keep all API keys (`TINYFISH_API_KEY`, `GEMINI_API_KEY`) in `.env` and list dummy keys in `.env.example`.
- **Human-in-the-loop guardrail:** `/api/apply` must fill form fields and STOP before clicking the final Submit button.
- Include a `backend/fallback_cache.json` option as a guaranteed backup if venue Wi-Fi drops during judging.
- After editing code, run the relevant health check or build command to verify zero errors. For `backend/`, run `python backend/tests/run_all.py` (all suites must pass) and add/adjust tests in `backend/tests/` for new behavior. Tests must never touch the real `backend/clinics.db` or `backend/fallback_cache.json` (point `watchdog.DB_PATH` / `config.CACHE_PATH` at a temp dir). Patch functions on the module that owns them (e.g. `scanning.scan_one`, `config.tinyfish_client`, `config.gemini_client`, `geo.geocode_address`), never on `main`.
- Every Gemini JSON call goes through `llm.generate_json(prompt, schema)` (retries + backup models); don't call `client.models.generate_content` directly in feature modules. Tests fake `config.gemini_client` and set `llm.RETRY_DELAY_S = 0`.

# Demo Day Checklist (judging)
0. Re-record the demo replay the day of judging (`python backend/record_demo.py` with the backend running locally, then commit `backend/demo_mission.json` and redeploy): replayed results age like any saved result.
1. On good Wi-Fi beforehand: run a search with "Re-check every clinic" on (or `POST /api/clinics/seed` for more clinics) so the clinic database is fresh; to update the committed seed, re-run the seeding script (see `backend/seed_clinics.json` "note"). `backend/fallback_cache.json` (5 London clinics) is only the last-resort backup now.
2. Start the backend, open `/health`, and check the startup log says both API keys are `set`.
3. If Wi-Fi is shaky, run scans with `use_cache: true` (instant replay). Distances need network for the postal code lookup; map pins work offline once the cache has `lat`/`lng`.
4. Watchdog demo: start from the home page's "Watch a demo search" (`/find?demo=1`): it auto-watches the closed clinic with the demo email; press "See what the alert looks like" for the opening alert. No prep needed.
5. Apply demo: use fake patient data on a real waitlist form and show the review modal; never submit for real. If the site blocks it, show the `manual_required` message.
