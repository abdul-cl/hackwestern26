"""Expired availability ("Needs a re-check") and hiding dead clinic sites. No network, no credits."""
import contextlib, json, os, sqlite3, sys, tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, BACKEND)
import os as _os, tempfile as _tempfile
_os.environ.setdefault("DATA_DIR", _tempfile.mkdtemp())  # never touch the real clinics.db
_os.environ.setdefault("CARESCOUT_SEED", "0")  # tests start with an empty clinic database
import app.main as m
from app import config, common, clinic_db, refresh, scanning, ranking, geo, watchdog
from fastapi.testclient import TestClient

tmp = Path(tempfile.mkdtemp())
REAL_CACHE = config.CACHE_PATH
real_before = REAL_CACHE.read_bytes()
config.CACHE_PATH = tmp / "cache.json"
clinic_db.DB_PATH = watchdog.DB_PATH = tmp / "t.db"
os.environ["TINYFISH_API_KEY"] = os.environ["GEMINI_API_KEY"] = "fake"
config.MAX_AGENTS, config.GEMINI_RPM = 50, 60000
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else extra)
    if not cond:
        fails.append(name)


def ago(days):
    return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")


def set_row(url, **cols):
    with contextlib.closing(clinic_db.connect()) as conn, conn:
        for k, v in cols.items():
            conn.execute(f"UPDATE clinics SET {k}=? WHERE url_key=?", (v, clinic_db.url_key(url)))


async def no_geo(*a, **k):
    return None
geo.geocode_address = geo.geocode_postal_code = no_geo


async def blocked(url):
    raise refresh.PageReadError("blocked in tests")
refresh.fetch_page = blocked

agent_calls = []
def fake_scan_one(url):
    agent_calls.append(url)
    return {"name": "Fresh " + url, "url": url, "status": "accepting", "evidence_quote": "q", "waitlist_url": None,
            "raw_notes": "ok", "address": None, "lat": None, "lng": None, "distance_km": None}
scanning.scan_one = fake_scan_one

rank_calls = []
def fake_rank(req):
    rank_calls.append(req)
    return {"ranked_clinics": [{"name": x["name"], "url": x["url"], "score": 50, "reason": "r", "requirements": [], "next_step": "n"} for x in req.clinics]}
ranking.rank = fake_rank

base = {"evidence_quote": "q", "waitlist_url": None, "raw_notes": "n", "address": None, "lat": None, "lng": None}
C = "Agetown, ON"
for url, name, status in [("https://new.ca", "New", "accepting"), ("https://old.ca", "Old", "accepting"), ("https://oldfull.ca", "Old Full", "closed")]:
    clinic_db.save_check(url, C, {**base, "url": url, "name": name, "status": status}, "h", "page")
set_row("https://old.ca", last_checked=ago(10))
set_row("https://oldfull.ca", last_checked=ago(20))

# --- expiry flags
new, old = clinic_db.to_clinic(clinic_db.get("https://new.ca")), clinic_db.to_clinic(clinic_db.get("https://old.ca"))
check("fresh clinic not expired", new["expired"] is False and new["status_age_days"] == 0.0, str(new))
check("10-day-old status expired (limit 7)", old["expired"] is True and 9.9 <= old["status_age_days"] <= 10.1, str(old))
check("expired keeps the last-seen status", old["status"] == "accepting")
config.MAX_STATUS_AGE_DAYS = 15
check("limit is a setting", clinic_db.to_clinic(clinic_db.get("https://old.ca"))["expired"] is False)
config.MAX_STATUS_AGE_DAYS = 7
check("unchecked clinic is not 'expired'", clinic_db.is_expired({"status": None}) is False)
check("status without a check time counts as expired", clinic_db.is_expired({"status": "accepting", "last_checked": None}) is True)
order = [r["url"] for r in clinic_db.nearby(C, None, 10)]
check("expired clinics sort after current ones", order == ["https://new.ca", "https://old.ca", "https://oldfull.ca"], str(order))
st = clinic_db.stats(12)
check("stats count expired", st["expired"] == 2 and st["hidden_dead"] == 0, str(st))

# --- missions
c = TestClient(m.app, raise_server_exceptions=False).__enter__()


def mission(**body):
    r = c.post("/api/mission/stream", json=body)
    return [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]


ev = mission(city=C, use_cache=True, user_email="pat@x.ca")
s = ev[-1]["summary"]
check("saved mode: expired clinics shown, flagged, not counted as accepting/closed",
      s["accepting_count"] == 1 and s["closed_count"] == 0 and s["expired_count"] == 2 and s["total_scanned"] == 3, str(s))
sent = {x["url"]: x for x in rank_calls[-1].clinics}
check("ranking sees expired + age", sent["https://old.ca"]["expired"] is True and sent["https://old.ca"]["status_age_days"] >= 9.9)
check("an expired 'closed' clinic isn't auto-watched", [e for e in ev if e["type"] == "watched"][0]["count"] == 0)
agent_calls.clear()
ev = mission(city=C)
check("auto mode re-checks expired clinics", sorted(agent_calls) == ["https://old.ca", "https://oldfull.ca"], str(agent_calls))
check("after re-check nothing is expired", ev[-1]["summary"]["expired_count"] == 0 and clinic_db.stats(12)["expired"] == 0)
check("ranking prompt mentions expired", "expired: true" in open(Path(BACKEND) / "app" / "ranking.py", encoding="utf-8").read())

# --- dead sites
D = "https://dead.ca"
clinic_db.save_check(D, C, {**base, "url": D, "name": "Dead", "status": "accepting"}, "h", "page")
row = clinic_db.mark_failed(D, "HTTP 404")
check("first failure starts failing_since, keeps status", row["failing_since"] and row["fail_count"] == 1 and row["status"] == "accepting")
since = row["failing_since"]
row = clinic_db.mark_failed(D, "HTTP 404")
check("failing_since keeps the first failure time", row["failing_since"] == since and row["fail_count"] == 2)
set_row(D, failing_since=ago(40), fail_count=5)
check("failing for 40 days with 5 failures -> dead", clinic_db.is_dead(clinic_db.get(D)))
check("dead clinic hidden from searches", D not in [r["url"] for r in clinic_db.nearby(C, None, 50)])
check("dead clinic hidden from GET /api/clinics", D not in [x["url"] for x in c.get("/api/clinics", params={"city": C}).json()["clinics"]])
check("stats count hidden dead sites", clinic_db.stats(12)["hidden_dead"] == 1)
set_row(D, last_checked=ago(30))
stale_urls = [r["url"] for r in clinic_db.stale(50, 12)]
check("dead clinic still retried by the refresher, last in line", stale_urls and stale_urls[-1] == D, str(stale_urls))
set_row(D, fail_count=2)
check("too few failures -> not dead", not clinic_db.is_dead(clinic_db.get(D)))
set_row(D, fail_count=5, failing_since=ago(10))
check("failing for only 10 days -> not dead", not clinic_db.is_dead(clinic_db.get(D)))
set_row(D, failing_since=ago(40))
clinic_db.save_check(D, C, {**base, "url": D, "name": "Dead", "status": "waitlist"}, "h2", "page")
row = clinic_db.get(D)
check("a successful check revives it", row["failing_since"] is None and row["fail_count"] == 0 and not clinic_db.is_dead(row)
      and D in [r["url"] for r in clinic_db.nearby(C, None, 50)])
clinic_db.mark_failed(D, "x")
clinic_db.mark_unchanged(D)
check("unchanged page also clears failing_since", clinic_db.get(D)["failing_since"] is None)

# --- migration: a database made before failing_since existed
oldp = tmp / "old.db"
con = sqlite3.connect(oldp)
con.execute("CREATE TABLE clinics (url_key TEXT PRIMARY KEY, url TEXT NOT NULL, name TEXT, city TEXT, city_key TEXT, status TEXT, "
            "evidence_quote TEXT, waitlist_url TEXT, raw_notes TEXT, address TEXT, lat REAL, lng REAL, content_hash TEXT, checked_via TEXT, "
            "last_checked TEXT, last_changed TEXT, last_error TEXT, fail_count INTEGER DEFAULT 0, source TEXT, created_at TEXT)")
con.execute("INSERT INTO clinics (url_key, url, city_key, status, last_checked) VALUES ('m.ca', 'https://m.ca', 'agetown', 'closed', ?)", (ago(1),))
con.commit(); con.close()
clinic_db.DB_PATH = oldp
row = clinic_db.get("https://m.ca")
check("old database gains failing_since column", "failing_since" in row and row["failing_since"] is None and row["status"] == "closed")
check("old database rows work in searches", [r["url"] for r in clinic_db.nearby(C, None, 5)] == ["https://m.ca"])

check("real fallback_cache.json untouched", REAL_CACHE.read_bytes() == real_before)
print("\nALL PASSED" if not fails else "\nFAILED: " + str(fails))
