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
- `POST /api/scan`
    - Request: `{ "city": "London, ON", "preferences": ["string"], "clinic_urls": ["string"] }`
    - Response (streamed or JSON):
      `{ "clinics": [{ "name": "string", "url": "string", "status": "accepting | waitlist | closed", "evidence_quote": "string", "waitlist_url": "string | null", "raw_notes": "string" }] }`
- `POST /api/scan/stream` (SSE, for the live agent activity feed)
    - Request: same body as `/api/scan` (`city`, `preferences`, `clinic_urls`, `use_cache`).
    - Response: `text/event-stream`. Each message is `data: <json>` followed by a blank line. Clinics scan in parallel, so results arrive in any order:
      - `{ "type": "status", "url": "string", "message": "Agent started scanning..." }`
      - `{ "type": "clinic_result", "clinic": { ...same clinic object as /api/scan... } }` (one per clinic, as soon as it finishes)
      - `{ "type": "done", "total": 5 }` (last event)
    - It is a POST, so use `fetch` + `response.body.getReader()` (not `EventSource`). With `use_cache: true` it replays `backend/fallback_cache.json` instantly.
- `POST /api/discover` (find clinic websites for a city; feed the result into `/api/scan`)
    - Request: `{ "city": "London, ON", "max_results": 5 }`
    - Response: `{ "city": "London, ON", "clinic_urls": ["https://..."] }` (clean, deduplicated https URLs; no Yelp/Reddit/Facebook/RateMDs). TinyFish searches the web, then Gemini filters the results to real family clinics in that city (Gemini search grounding has no quota on our key). Usually 3-8s.
    - If it fails or finds nothing for London, it returns our 5 default London URLs. For other cities the list may be empty.
- `POST /api/rank`
    - Request: `{ "preferences": ["string"], "clinics": [...] }`
    - Response:
      `{ "ranked_clinics": [{ "name": "string", "score": 0, "reason": "string", "requirements": ["string"], "next_step": "string" }] }`
- `POST /api/apply`
    - Request: `{ "waitlist_url": "string", "patient_info": { "name": "string", "email": "string", "phone": "string", "postal_code": "string" } }`
    - Response:
      `{ "status": "ready_for_review", "filled_fields": {}, "summary": "string", "screenshot_url": "string | null" }`

# Rules for Claude
- Keep code flat, simple, and easy to debug.
- Never read, print, or commit `.env` files. Keep all API keys (`TINYFISH_API_KEY`, `GEMINI_API_KEY`) in `.env` and list dummy keys in `.env.example`.
- **Human-in-the-loop guardrail:** `/api/apply` must fill form fields and STOP before clicking the final Submit button.
- Include a `backend/fallback_cache.json` option as a guaranteed backup if venue Wi-Fi drops during judging.
- After editing code, run the relevant health check or build command to verify zero errors.
