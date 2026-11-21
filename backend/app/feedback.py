"""Patient feedback survey: POST /api/feedback, GET /api/feedback/summary.

Anonymous on purpose: no email, no IP, no health details asked for. Stored in clinics.db (DATA_DIR), table `feedback`.
The summary only ever returns counts and averages, never anyone's comment.
"""
import contextlib
import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter

from . import clinic_db, models

router = APIRouter()


def connect() -> sqlite3.Connection:
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
