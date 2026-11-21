"""Clinic Watchdog storage: watched clinics in SQLite (backend/clinics.db). No FastAPI code here."""
import contextlib
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "clinics.db"  # backend/clinics.db, wherever uvicorn is launched
STATUSES = ("accepting", "waitlist", "closed")

STATUS_LABELS = {"accepting": "accepting new patients", "waitlist": "has an open waitlist", "closed": "not accepting new patients"}


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect() -> sqlite3.Connection:
    """Open the DB, creating the table (and adding columns missing from older versions)."""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute(
        "CREATE TABLE IF NOT EXISTS watches ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, clinic_name TEXT, url TEXT, "
        "last_status TEXT, user_email TEXT, created_at TEXT, last_checked TEXT, "
        "UNIQUE(url, user_email))"
    )
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(watches)")}
    for col in ("created_at", "last_checked"):
        if col not in cols:  # DB made by the first watchdog version
            conn.execute(f"ALTER TABLE watches ADD COLUMN {col} TEXT")
    conn.execute("UPDATE watches SET created_at = ? WHERE created_at IS NULL", (now_iso(),))
    conn.execute(
        "CREATE TABLE IF NOT EXISTS alerts ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, watch_id INTEGER, clinic_name TEXT, url TEXT, user_email TEXT, "
        "old_status TEXT, new_status TEXT, evidence_quote TEXT, message TEXT, simulated INTEGER DEFAULT 0, created_at TEXT)"
    )
    conn.commit()
    return conn


def mask_email(email: str) -> str:
    """a.person@gmail.com -> a***@gmail.com (so one user never sees another's full email)."""
    name, _, domain = (email or "").partition("@")
    return (name[:1] + "***@" + domain) if domain else "***"


def add_watch(clinic_name: str, url: str, last_status: str, user_email: str) -> dict:
    """Insert, or update the existing watch for the same url + email (never a duplicate). Keeps created_at."""
    with contextlib.closing(connect()) as conn, conn:
        conn.execute(
            "INSERT INTO watches (clinic_name, url, last_status, user_email, created_at, last_checked) "
            "VALUES (?, ?, ?, ?, ?, NULL) "
            "ON CONFLICT(url, user_email) DO UPDATE SET clinic_name = excluded.clinic_name, last_status = excluded.last_status",
            (clinic_name, url, last_status, user_email, now_iso()),
        )
        row = conn.execute("SELECT * FROM watches WHERE url = ? AND user_email = ?", (url, user_email)).fetchone()
    return dict(row)


def list_watches(user_email: str | None = None) -> list[dict]:
    """Newest first. Only this user's watches if user_email is given."""
    sql = "SELECT * FROM watches {} ORDER BY created_at DESC, id DESC"
    with contextlib.closing(connect()) as conn:
        if user_email:
            rows = conn.execute(sql.format("WHERE user_email = ?"), (user_email.strip(),)).fetchall()
        else:
            rows = conn.execute(sql.format("")).fetchall()
    return [dict(r) for r in rows]


def get_watch(watch_id: int | None) -> dict | None:
    """One watch by id, or the most recently created one when watch_id is None."""
    with contextlib.closing(connect()) as conn:
        if watch_id is None:
            row = conn.execute("SELECT * FROM watches ORDER BY created_at DESC, id DESC LIMIT 1").fetchone()
        else:
            row = conn.execute("SELECT * FROM watches WHERE id = ?", (watch_id,)).fetchone()
    return dict(row) if row else None


def delete_watch(watch_id: int, user_email: str) -> bool:
    """Stop watching. Only the owner (matching user_email) can delete. Returns True if a row was deleted."""
    with contextlib.closing(connect()) as conn, conn:
        cur = conn.execute("DELETE FROM watches WHERE id = ? AND user_email = ?", (watch_id, user_email.strip()))
    return cur.rowcount > 0


def save_alerts(alerts: list[dict], raw_emails: dict[int, str], simulated: bool = False) -> None:
    """Keep a history of alerts (always stored with the real email; masking happens when they're read)."""
    if not alerts:
        return
    stamp = now_iso()
    with contextlib.closing(connect()) as conn, conn:
        for a in alerts:
            conn.execute(
                "INSERT INTO alerts (watch_id, clinic_name, url, user_email, old_status, new_status, evidence_quote, "
                "message, simulated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (a["id"], a["clinic_name"], a["url"], raw_emails.get(a["id"], a["user_email"]), a["old_status"],
                 a["new_status"], a.get("evidence_quote", ""), a["message"], int(simulated), stamp),
            )


def list_alerts(user_email: str | None = None, limit: int = 20) -> list[dict]:
    """Newest first. Each item: the alert shape plus alert_id, created_at and simulated (watch id stays in 'id')."""
    sql = "SELECT * FROM alerts {} ORDER BY id DESC LIMIT ?"
    with contextlib.closing(connect()) as conn:
        if user_email:
            rows = conn.execute(sql.format("WHERE user_email = ?"), (user_email.strip(), limit)).fetchall()
        else:
            rows = conn.execute(sql.format(""), (limit,)).fetchall()
    out = []
    for r in rows:
        r = dict(r)
        out.append({
            "alert_id": r["id"], "id": r["watch_id"], "clinic_name": r["clinic_name"], "url": r["url"],
            "user_email": r["user_email"] if user_email else mask_email(r["user_email"]),
            "old_status": r["old_status"], "new_status": r["new_status"], "evidence_quote": r["evidence_quote"] or "",
            "message": r["message"], "simulated": bool(r["simulated"]), "created_at": r["created_at"],
        })
    return out


def record_checks(updates: list[tuple[int, str]], checked_ids: list[int]) -> None:
    """Save new statuses [(id, status)] and stamp last_checked on every successfully checked watch."""
    stamp = now_iso()
    with contextlib.closing(connect()) as conn, conn:
        for watch_id, status in updates:
            conn.execute("UPDATE watches SET last_status = ? WHERE id = ?", (status, watch_id))
        for watch_id in checked_ids:
            conn.execute("UPDATE watches SET last_checked = ? WHERE id = ?", (stamp, watch_id))


def make_alert(watch: dict, new_status: str, evidence_quote: str = "", show_email: bool = True) -> dict:
    """The alert object returned by /api/watch/check and /api/watch/simulate-opening."""
    old = watch["last_status"]
    if new_status in ("accepting", "waitlist"):
        message = f"Good news: {watch['clinic_name']} {STATUS_LABELS[new_status]} (was {old}). Act fast, spots fill quickly."
    else:
        message = f"{watch['clinic_name']} is now {STATUS_LABELS.get(new_status, new_status)} (was {old})."
    return {
        "id": watch["id"],
        "clinic_name": watch["clinic_name"],
        "url": watch["url"],
        "user_email": watch["user_email"] if show_email else mask_email(watch["user_email"]),
        "old_status": old,
        "new_status": new_status,
        "evidence_quote": evidence_quote,
        "message": message,
    }
