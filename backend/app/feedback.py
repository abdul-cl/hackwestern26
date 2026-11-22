"""Patient feedback survey: POST /api/feedback, GET /api/feedback/summary, GET /api/feedback (admin: the comments).

Anonymous on purpose: no email, no IP, no health details asked for. Stored in clinics.db (DATA_DIR), table `feedback`.
The summary only ever returns counts and averages, never anyone's comment.
"""
import contextlib
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from . import clinic_db, config, models

router = APIRouter()


def connect() -> sqlite3.Connection:
    Path(clinic_db.DB_PATH).parent.mkdir(parents=True, exist_ok=True)  # a fresh DATA_DIR may not exist yet
    conn = sqlite3.connect(clinic_db.DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute(
        "CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, helped TEXT, ease INTEGER, "
        "comment TEXT, page TEXT, created_at TEXT)"
    )
    return conn


@router.post("/api/feedback")
def add_feedback(req: models.FeedbackRequest):
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with contextlib.closing(connect()) as conn, conn:
        cur = conn.execute(
            "INSERT INTO feedback (helped, ease, comment, page, created_at) VALUES (?, ?, ?, ?, ?)",
            (req.helped, req.ease, req.comment.strip(), req.page.strip(), stamp),
        )
    return {"saved": True, "id": cur.lastrowid}


@router.get("/api/feedback/summary")
def feedback_summary():
    with contextlib.closing(connect()) as conn:
        rows = [dict(r) for r in conn.execute("SELECT helped, ease FROM feedback").fetchall()]
    rated = [r["ease"] for r in rows if r["ease"]]
    return {
        "count": len(rows),
        "helped": {k: sum(r["helped"] == k for r in rows) for k in ("yes", "somewhat", "no")},
        "average_ease": round(sum(rated) / len(rated), 2) if rated else None,
    }


@router.get("/api/feedback")
def list_feedback(request: Request, limit: int = 200):
    """Every answer with its comment, newest first. Comments are for the team only: this needs the admin key
    (header X-Admin-Key) whenever CARESCOUT_ADMIN_KEY is set, and always on the public demo."""
    if (config.ADMIN_KEY or config.PUBLIC_DEMO) and not config.is_admin(request):
        raise HTTPException(status_code=403, detail="Feedback comments are only for the CareScout team (X-Admin-Key header).")
    with contextlib.closing(connect()) as conn:
        rows = conn.execute(
            "SELECT id, helped, ease, comment, page, created_at FROM feedback ORDER BY id DESC LIMIT ?", (max(1, min(limit, 1000)),)
        ).fetchall()
    return {"feedback": [dict(r) for r in rows], "summary": feedback_summary()}
