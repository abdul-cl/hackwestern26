# Project Overview
- **Name:** CareScout — Autonomous Family Doctor & Clinic Hunter for Ontario
- **Goal:** An AI employee that hunts across real, public clinic websites in London, Ontario to find family doctors accepting new patients, ranks them by patient preferences, auto-fills public waitlist/intake forms (stopping before final Submit for human-in-the-loop safety), and watches full clinics for status changes.
- **Target Prizes:** Hire Your First AI Employee (TinyFish), Best Health Hack (Sun Life), Best Use of Gemini API, Best Use of Entire.

# Tech Stack & Folder Ownership (Strict)
- `backend/` — Owned by Abdul. Python FastAPI + Uvicorn (port 8000), TinyFish Python SDK (`tinyfish`) for live browsing/form-filling/monitoring, Google Gemini API (`google-genai`) for parsing & ranking clinic policies.
- `frontend/` — Owned by Ayush. React / Next.js / Vite dashboard with clean healthcare UI, patient profile form, live streaming agent activity feed, clinic status cards (Accepting / Waitlist Open / Not Accepting), and an Auto-Fill Waitlist preview modal.
- **Strict rule:** Neither person's Claude session edits files inside the other person's folder without asking.

# Commands
- Backend run: `cd backend && uvicorn app.main:app --reload --port 8000`
- Frontend run: `cd frontend && npm run dev`

# API Contract (Source of Truth)
- **Errors (all endpoints):** failures are always JSON `{ "detail": "string" }`. `401` = missing/wrong `X-API-Key` (only when auth is on), `422` = invalid request body (incl. oversized lists/strings), `500` = missing/placeholder API key (`TINYFISH_API_KEY` / `GEMINI_API_KEY`) or unexpected server error (details only in the backend log), `502` = Gemini failed in `/api/rank`.
- **Security settings (backend `.env`, all optional):**
    - `CARESCOUT_API_KEY` — if set, every `/api/*` request must send header `X-API-Key: <value>` (frontend: put it in a Vite/Next env var). Unset = no auth (local dev). `/health` is always open.
    - `ALLOWED_ORIGINS` — comma-separated extra frontend origins for CORS (e.g. a deployed URL). By default only `http://localhost:*` and `http://127.0.0.1:*` are allowed.
    - `DISABLE_DOCS=1` — hides `/docs`, `/redoc`, `/openapi.json` (use when hosting publicly).
    - Run uvicorn without `--host 0.0.0.0` unless you mean to expose it on the network.
- **Size limits:** `clinic_urls` ≤ 20 after dedup, `clinics` (rank) ≤ 30, `preferences` ≤ 20, `city` ≤ 100 chars, patient fields capped (name 120, email 200, phone 40, postal_code 12).
- `POST /api/scan`
    - Request: `{ "city": "London, ON", "preferences": ["string"], "clinic_urls": ["string"], "use_cache": false }` (`city` and `preferences` are accepted but not used yet; `clinic_urls` empty = the 5 London defaults, max 20; `use_cache` defaults to `false`)
    - Response (JSON):
      `{ "clinics": [{ "name": "string", "url": "string", "status": "accepting | waitlist | closed", "evidence_quote": "string", "waitlist_url": "string | null", "raw_notes": "string" }] }`
    - A clinic whose scan failed or timed out (90s each) does NOT break the scan: it comes back with `status: "closed"` and `raw_notes` starting with `scan failed:` or `scan error:`. Show it as "couldn't check" in the UI.
    - `use_cache: true` returns `backend/fallback_cache.json` instantly; if that file is missing or corrupted it silently does a live scan. The cache is only rewritten by a fully successful scan of the default London list.
- `POST /api/scan/stream` (SSE, for the live agent activity feed)
    - Request: same body as `/api/scan` (`city`, `preferences`, `clinic_urls`, `use_cache`).
    - Response: `text/event-stream`. Each message is `data: <json>` followed by a blank line. Clinics scan in parallel, so results arrive in any order:
      - `{ "type": "status", "url": "string", "message": "Agent started scanning..." }`
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
      `{ "ranked_clinics": [{ "name": "string", "score": 0, "reason": "string", "requirements": ["string"], "next_step": "string", "coverage_tags": ["string"], "phone_number": "string | null", "call_hours": "string | null", "call_script": "string | null" }] }`
      - Phone-only clinics: `phone_number` / `call_hours` are pulled from the scan notes (null if the clinic didn't list them; never invented). `call_script` is only filled when the clinic's `waitlist_url` is null: a 2-3 sentence script in the requested `language` the patient can read aloud, then a line `Have ready:` with a short checklist (health card, postal code, etc.). Render it with preserved line breaks, plus a "Call" button using `tel:` on `phone_number`.
      - `reason`, `requirements`, `next_step` are written in the requested `language`. `name` and `coverage_tags` stay in English.
      - `coverage_tags` are badges for the UI, e.g. `["OHIP", "Nurse Practitioner"]`, `["UHIP Friendly"]`, `["Check Eligibility"]` (use the last one when the clinic's notes don't say). May be empty.
      - Clinics matching the coverage type / language are ranked higher. Results are sorted by `score`, best first.
- `POST /api/apply`
    - Request: `{ "waitlist_url": "string", "patient_info": { "name": "string", "email": "string", "phone": "string", "postal_code": "string" } }`
    - Response (always HTTP 200 with this shape once the request is valid):
      `{ "status": "ready_for_review | manual_required | error", "filled_fields": {}, "summary": "string", "screenshot_url": "string | null" }`
      - `ready_for_review`: fields were filled and the agent stopped BEFORE Submit; show the preview modal.
      - `manual_required`: blocked form / captcha / login / no form found / agent failed or took over 120s. `summary` says why and links the page; tell the user to finish it manually.
      - `error`: unexpected failure, OR the agent reports the form was actually submitted (guardrail breach). `summary` says which; show it prominently.
    - `422` if `waitlist_url` is not an `https://` URL (patient data is never sent to plain http pages).
    - The agent is told to treat page text as data (prompt-injection hardening). The no-Submit rule is still enforced by the agent's instructions, not by code, so always keep the human review step.

- `POST /api/watch` (Clinic Watchdog: "Watch Clinic" button)
    - Request: `{ "clinic_name": "string", "url": "string", "last_status": "accepting | waitlist | closed", "user_email": "string" }`
    - `422` if `last_status` isn't one of the three statuses, `url` isn't http(s), or `user_email` has no `@`.
    - Response: the saved item `{ "id": 1, "clinic_name": "...", "url": "...", "last_status": "...", "user_email": "..." }`. Watching the same `url` + `user_email` again updates it instead of duplicating.
- `GET /api/watch?user_email=you@example.com`
    - Response: `{ "watches": [ { "id", "clinic_name", "url", "last_status", "user_email" } ] }`
    - Pass `user_email` to get only that user's watches. Without it, all watches are returned with emails masked (`a***@gmail.com`).
- `POST /api/watch/check?user_email=you@example.com` ("Check Watchlist Now" button; no body)
    - Re-scans watched clinics (only that user's if `user_email` is given; slow: about as long as `/api/scan`), saves new statuses. Alert emails are masked when `user_email` is omitted.
    - Response: `{ "checked": 3, "failed": 0, "alerts": [ { "id", "clinic_name", "url", "user_email", "old_status", "new_status", "evidence_quote", "message" } ] }`. `alerts` only has clinics whose status changed (e.g. `closed` -> `accepting`). `failed` counts clinics whose scan errored; their status is left unchanged.
    - Data lives in `backend/clinics.db` (SQLite, git-ignored).

# Rules for Claude
- Keep code flat, simple, and easy to debug.
- Never read, print, or commit `.env` files. Keep all API keys (`TINYFISH_API_KEY`, `GEMINI_API_KEY`) in `.env` and list dummy keys in `.env.example`.
- **Human-in-the-loop guardrail:** `/api/apply` must fill form fields and STOP before clicking the final Submit button.
- Include a `backend/fallback_cache.json` option as a guaranteed backup if venue Wi-Fi drops during judging.
- After editing code, run the relevant health check or build command to verify zero errors.
