# Project Overview
- **Goal:** [1-sentence description of what our app does]
- **Demo Flow:** [Step 1 user clicks X -> Step 2 backend does Y -> Step 3 screen shows Z]

# Folder Ownership (Strict)
- `frontend/`: Owned by Ayush. UI, styling, and client fetch calls.
- `backend/`: Owned by Abdul. Python FastAPI server, APIs, and core logic.
  - Do not modify files in the other person's folder without asking.

# Commands
- Backend run: `cd backend && uvicorn app.main:app --reload --port 8000`
- Frontend run: `cd frontend && npm run dev`

# API Contract (Source of Truth)
- `POST /api/run`
    - Request JSON: `{ "input": "string" }`
    - Response JSON: `{ "output": "string" }`

# Rules for Claude
- Keep code simple, flat, and easy to debug during a hackathon.
- Never read, print, or commit `.env` files.
- After editing code, run the relevant build or health check to verify there are no errors.