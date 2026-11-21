"""Clinic database: every clinic CareScout knows about, its details and its latest availability (SQLite).

Clinic details (name, address, map location) rarely change; availability does. Searches read from here instantly and
only re-check clinics that are out of date (see refresh.py). No FastAPI code here.
"""
import contextlib
import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

DB_PATH = Path(os.getenv("DATA_DIR") or Path(__file__).resolve().parents[1]) / "clinics.db"  # same file as watchdog.py
STATUSES = ("accepting", "waitlist", "closed")
STATUS_ORDER = {"accepting": 0, "waitlist": 1, "closed": 2}
FIELDS = ("name", "status", "evidence_quote", "waitlist_url", "raw_notes", "address", "lat", "lng")


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(value: str | None) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) if value else None
    except ValueError:
        return None


def city_key(city: str | None) -> str:
    """'London, ON' -> 'london' (searches match on the city name only)."""
    return (city or "").split(",")[0].strip().lower()


def url_key(url: str) -> str:
    """One row per page: https://www.X.ca/page/ and http://x.ca/page are the same clinic page."""
    p = urlparse((url or "").strip())
    host = (p.hostname or "").lower().removeprefix("www.")
    path = p.path.rstrip("/")
    return f"{host}{path}" + (f"?{p.query}" if p.query else "")


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute(
        "CREATE TABLE IF NOT EXISTS clinics ("
        "url_key TEXT PRIMARY KEY, url TEXT NOT NULL, name TEXT, city TEXT, city_key TEXT, "
        "status TEXT, evidence_quote TEXT, waitlist_url TEXT, raw_notes TEXT, address TEXT, lat REAL, lng REAL, "
        "content_hash TEXT, checked_via TEXT, last_checked TEXT, last_changed TEXT, "
        "last_error TEXT, fail_count INTEGER DEFAULT 0, source TEXT, created_at TEXT)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS clinics_city ON clinics(city_key)")
    conn.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
    return conn


# ---------- reads ----------

def get(url: str) -> dict | None:
    with contextlib.closing(connect()) as conn:
        row = conn.execute("SELECT * FROM clinics WHERE url_key = ?", (url_key(url),)).fetchone()
    return dict(row) if row else None


def count() -> int:
    with contextlib.closing(connect()) as conn:
        return conn.execute("SELECT COUNT(*) FROM clinics").fetchone()[0]


def is_fresh(row: dict | None, hours: float) -> bool:
    checked = parse_iso((row or {}).get("last_checked"))
    return bool(row and row.get("status") and checked and datetime.now(timezone.utc) - checked < timedelta(hours=hours))


def to_clinic(row: dict) -> dict:
    """A database row in the API's clinic shape (plus last_checked / checked_via)."""
    return {
        "name": row.get("name") or row["url"],
        "url": row["url"],
        "status": row.get("status") or "closed",
        "evidence_quote": row.get("evidence_quote") or "",
        "waitlist_url": row.get("waitlist_url") or None,
        "raw_notes": row.get("raw_notes") or "",
        "address": row.get("address") or None,
        "lat": row.get("lat"),
        "lng": row.get("lng"),
        "distance_km": None,
        "last_checked": row.get("last_checked"),
        "checked_via": row.get("checked_via") or "saved",
    }


def nearby(city: str, user_loc: dict | None, limit: int, include_unchecked: bool = True) -> list[dict]:
    """Clinics in this city, closest first when the patient's location is known (else accepting first)."""
    from .geo import haversine_km  # local import: geo is only needed for distance sorting

    with contextlib.closing(connect()) as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM clinics WHERE city_key = ?", (city_key(city),)).fetchall()]
    if not include_unchecked:
        rows = [r for r in rows if r.get("status")]

    def sort_key(r):
        if user_loc and r.get("lat") is not None and r.get("lng") is not None:
            dist = haversine_km(user_loc["lat"], user_loc["lng"], r["lat"], r["lng"])
        else:
            dist = float("inf")
        return (dist, STATUS_ORDER.get(r.get("status"), 3), (r.get("name") or r["url"]).lower())

    return sorted(rows, key=sort_key)[: max(0, limit)]


def stale(limit: int, hours: float) -> list[dict]:
    """Clinics that need a re-check: never checked first, then the longest ago."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
    with contextlib.closing(connect()) as conn:
        rows = conn.execute(
            "SELECT * FROM clinics WHERE status IS NULL OR last_checked IS NULL OR last_checked < ? "
            "ORDER BY (last_checked IS NOT NULL), last_checked LIMIT ?",
            (cutoff, max(0, limit)),
        ).fetchall()
    return [dict(r) for r in rows]


def stats(hours: float) -> dict:
    with contextlib.closing(connect()) as conn:
        rows = [dict(r) for r in conn.execute("SELECT status, last_checked, city FROM clinics").fetchall()]
        last = conn.execute("SELECT value FROM meta WHERE key = 'last_refresh'").fetchone()
    checked = [r for r in rows if r["status"]]
    return {
        "total": len(rows),
        "checked": len(checked),
        "fresh": sum(is_fresh(r, hours) for r in rows),
        "by_status": {s: sum(r["status"] == s for r in rows) for s in STATUSES},
        "cities": sorted({(r["city"] or "").strip() for r in rows if r["city"]}),
        "last_refresh": last["value"] if last else None,
    }


# ---------- writes ----------

def add_url(url: str, city: str, name: str | None = None, source: str = "discovered") -> bool:
    """Add a clinic page we haven't seen before (unchecked). Returns True if it was new."""
    with contextlib.closing(connect()) as conn, conn:
        cur = conn.execute(
            "INSERT OR IGNORE INTO clinics (url_key, url, name, city, city_key, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (url_key(url), url.strip(), name, city, city_key(city), source, now_iso()),
        )
    return cur.rowcount > 0


def save_check(url: str, city: str, clinic: dict, content_hash: str | None, checked_via: str) -> tuple[dict, str | None]:
    """Store a successful check. Returns (row, old_status). Keeps coordinates if the address didn't change."""
    add_url(url, city, clinic.get("name"))
    old = get(url) or {}
    stamp = now_iso()
    values = {f: clinic.get(f) for f in FIELDS}
    if values["lat"] is None and (values["address"] or None) == (old.get("address") or None):
        values["lat"], values["lng"] = old.get("lat"), old.get("lng")
    changed = old.get("status") != values["status"]
    with contextlib.closing(connect()) as conn, conn:
        conn.execute(
            "UPDATE clinics SET name=?, status=?, evidence_quote=?, waitlist_url=?, raw_notes=?, address=?, lat=?, lng=?, "
            "content_hash=?, checked_via=?, last_checked=?, last_changed=CASE WHEN ? THEN ? ELSE last_changed END, "
            "last_error=NULL, fail_count=0, city=COALESCE(city, ?), city_key=COALESCE(city_key, ?) WHERE url_key=?",
            (values["name"], values["status"], values["evidence_quote"], values["waitlist_url"], values["raw_notes"],
             values["address"], values["lat"], values["lng"], content_hash, checked_via, stamp, changed, stamp,
             city, city_key(city), url_key(url)),
        )
    return get(url), old.get("status")


def mark_unchanged(url: str) -> dict | None:
    """The page text is the same as last time: the stored result is still right, just re-stamp it."""
    with contextlib.closing(connect()) as conn, conn:
        conn.execute("UPDATE clinics SET last_checked=?, last_error=NULL, fail_count=0 WHERE url_key=?", (now_iso(), url_key(url)))
    return get(url)


def mark_failed(url: str, error: str) -> dict | None:
    """A check failed: keep the last good result (if any) and remember the error."""
    with contextlib.closing(connect()) as conn, conn:
        conn.execute("UPDATE clinics SET last_error=?, fail_count=COALESCE(fail_count, 0) + 1 WHERE url_key=?", (error[:300], url_key(url)))
    return get(url)


def set_location(url: str, lat: float | None, lng: float | None) -> None:
    if lat is None or lng is None:
        return
    with contextlib.closing(connect()) as conn, conn:
        conn.execute("UPDATE clinics SET lat=?, lng=? WHERE url_key=? AND lat IS NULL", (lat, lng, url_key(url)))


def set_meta(key: str, value: str) -> None:
    with contextlib.closing(connect()) as conn, conn:
        conn.execute("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, value))


# ---------- seeding ----------

def seed_if_empty(seed_path: Path, cache_path: Path, default_urls: list[str]) -> int:
    """Fill an empty database from seed_clinics.json, the saved demo scan and the default London clinics.
    Returns how many clinics were added (0 if the database already had any)."""
    if count():
        return 0
    added = 0

    def load(path: Path) -> list[dict]:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return [c for c in data.get("clinics", []) if isinstance(c, dict) and c.get("url")]
        except Exception:
            return []

    def mtime_iso(path: Path) -> str | None:
        try:
            return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except OSError:
            return None

    for path, default_checked in ((seed_path, None), (cache_path, mtime_iso(cache_path))):
        for c in load(path):
            if (c.get("raw_notes") or "").startswith(("scan failed", "scan error")):
                continue
            city = c.get("city") or "London, ON"
            if not add_url(c["url"], city, c.get("name"), source="seed"):
                continue
            added += 1
            if c.get("status") in STATUSES:
                with contextlib.closing(connect()) as conn, conn:
                    conn.execute(
                        "UPDATE clinics SET status=?, evidence_quote=?, waitlist_url=?, raw_notes=?, address=?, lat=?, lng=?, "
                        "checked_via=?, last_checked=? WHERE url_key=?",
                        (c["status"], c.get("evidence_quote") or "", c.get("waitlist_url"), c.get("raw_notes") or "",
                         c.get("address"), c.get("lat"), c.get("lng"), c.get("checked_via") or "saved",
                         c.get("last_checked") or default_checked, url_key(c["url"])),
                    )
    for url in default_urls:
        added += add_url(url, "London, ON", source="seed")
    return added


def export_rows() -> list[dict]:
    """Every checked clinic, for writing a new seed_clinics.json."""
    with contextlib.closing(connect()) as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM clinics WHERE status IS NOT NULL ORDER BY city_key, name").fetchall()]
    keep = ("url", "name", "city", "status", "evidence_quote", "waitlist_url", "raw_notes", "address", "lat", "lng", "checked_via", "last_checked")
    return [{k: r.get(k) for k in keep} for r in rows]
