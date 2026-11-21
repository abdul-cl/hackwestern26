import os, re, sqlite3, sys, tempfile, time
from pathlib import Path

BACKEND = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, BACKEND)
import os as _os, tempfile as _tempfile
_os.environ.setdefault("DATA_DIR", _tempfile.mkdtemp())  # never touch the real clinics.db
_os.environ.setdefault("CARESCOUT_SEED", "0")  # tests start with an empty clinic database
_os.environ.setdefault("DEMO_REPLAY", "0")  # never replay the real demo recording in tests
import app.main as m
from app import config, common, models, cache, agents, geo, watchdog, scanning, discovery, ranking, apply_form, cpso, orchestrator, watch_api
import app.watchdog as wd
from fastapi.testclient import TestClient

REAL_DB = wd.DB_PATH
real_db_existed = REAL_DB.exists()
tmp = Path(tempfile.mkdtemp())
wd.DB_PATH = tmp / "t.db"
config.CACHE_PATH = tmp / "cache.json"
os.environ["TINYFISH_API_KEY"] = "fake"
config.MAX_AGENTS = 50  # no agent limit unless a test sets one
c = TestClient(m.app, raise_server_exceptions=False).__enter__()  # one event loop, like uvicorn
fails = []
ISO = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else extra)
    if not cond:
        fails.append(name)


check("DB path is clinics.db in DATA_DIR (default backend/)", REAL_DB.name == "clinics.db" and str(REAL_DB.parent) == os.environ["DATA_DIR"], str(REAL_DB))

# --- simulate with no watches
r = c.post("/api/watch/simulate-opening")
check("simulate with no watches -> 404 JSON", r.status_code == 404 and "No watched clinics" in r.json()["detail"], r.text)
check("check with no watches", c.post("/api/watch/check").json() == {"checked": 0, "failed": 0, "alerts": []})

# --- add
A = {"clinic_name": "Alpha Clinic", "url": "https://alpha.ca", "last_status": "closed", "user_email": "alice@gmail.com"}
r = c.post("/api/watch", json=A)
w1 = r.json()
check("add returns record with id/created_at/last_checked", r.status_code == 200 and set(w1) == {"id", "clinic_name", "url", "last_status", "user_email", "created_at", "last_checked"}
      and ISO.match(w1["created_at"]) and w1["last_checked"] is None, str(w1))
time.sleep(1.1)  # distinct created_at so newest-first ordering is real
w1b = c.post("/api/watch", json={**A, "clinic_name": "Alpha Clinic Renamed", "last_status": "waitlist"}).json()
check("duplicate url+email updates, keeps id/created_at", w1b["id"] == w1["id"] and w1b["created_at"] == w1["created_at"]
      and w1b["clinic_name"] == "Alpha Clinic Renamed" and w1b["last_status"] == "waitlist", str(w1b))
c.post("/api/watch", json={**A, "last_status": "closed", "clinic_name": "Alpha Clinic"})
time.sleep(1.1)
w2 = c.post("/api/watch", json={"clinic_name": "Beta", "url": "https://beta.ca", "last_status": "waitlist", "user_email": "bob@uwo.ca"}).json()
w3 = c.post("/api/watch", json={"clinic_name": "Boom", "url": "https://boom.ca", "last_status": "closed", "user_email": "bob@uwo.ca"}).json()
check("same url, different email = separate watch", c.post("/api/watch", json={**A, "user_email": "carol@x.ca"}).json()["id"] not in (w1["id"],))

# --- validation
for bad in [{"last_status": "maybe"}, {"user_email": "nope"}, {"url": "ftp://x"}, {"clinic_name": "x" * 201}]:
    check("422 " + str(list(bad)), c.post("/api/watch", json={**A, **bad}).status_code == 422)

# --- list
lst = c.get("/api/watch").json()
check("GET returns watched_clinics key", list(lst) == ["watched_clinics"], str(lst)[:200])
ids = [w["id"] for w in lst["watched_clinics"]]
check("newest first", ids == sorted(ids, reverse=True) and ids[-1] == w1["id"], str(ids))
check("emails masked without user_email", all("***" in w["user_email"] for w in lst["watched_clinics"]))
mine = c.get("/api/watch", params={"user_email": "bob@uwo.ca"}).json()["watched_clinics"]
check("user_email filter, unmasked, newest first", [w["clinic_name"] for w in mine] == ["Boom", "Beta"] and mine[0]["user_email"] == "bob@uwo.ca", str(mine))

# --- check: parallel scans, alerts, failed, last_checked
calls = []
def fake_scan_one(u):
    calls.append(u); time.sleep(0.5)
    if "boom" in u:
        return common.failed_clinic(u, "scan error: blocked")
    status = {"https://alpha.ca": "accepting", "https://beta.ca": "waitlist"}[u]
    return {"name": u, "url": u, "status": status, "evidence_quote": "Now accepting!", "waitlist_url": None, "raw_notes": "ok",
            "address": None, "lat": None, "lng": None, "distance_km": None}
scanning.scan_one = fake_scan_one
t = time.time()
j = c.post("/api/watch/check").json()
dt = time.time() - t
check("check: distinct urls scanned once each", sorted(calls) == ["https://alpha.ca", "https://beta.ca", "https://boom.ca"], str(calls))
check("check: parallel (3 x 0.5s scans in < 1.2s)", dt < 1.2, str(dt))
check("check: counts", j["checked"] == 3 and j["failed"] == 1, str(j))  # alpha(alice), alpha(carol), beta
alpha_alerts = [a for a in j["alerts"] if a["url"] == "https://alpha.ca"]
check("check: alerts only for changed (2 alpha watchers)", len(j["alerts"]) == 2 and len(alpha_alerts) == 2, str(j["alerts"]))
a0 = alpha_alerts[0]
check("alert shape + message", set(a0) == {"id", "clinic_name", "url", "user_email", "old_status", "new_status", "evidence_quote", "message"}
      and a0["old_status"] == "closed" and a0["new_status"] == "accepting" and "Good news" in a0["message"] and "***" in a0["user_email"], str(a0))
after = {w["clinic_name"] + w["user_email"]: w for w in c.get("/api/watch").json()["watched_clinics"]}
alpha = [w for w in after.values() if w["url"] == "https://alpha.ca"][0]
boom = [w for w in after.values() if w["url"] == "https://boom.ca"][0]
check("status saved + last_checked stamped", alpha["last_status"] == "accepting" and ISO.match(alpha["last_checked"] or ""), str(alpha))
check("failed scan: status and last_checked untouched", boom["last_status"] == "closed" and boom["last_checked"] is None, str(boom))
j2 = c.post("/api/watch/check").json()
check("second check: no repeat alerts", j2["alerts"] == [], str(j2))
calls.clear()
j3 = c.post("/api/watch/check", params={"user_email": "bob@uwo.ca"}).json()
check("check scoped to user", sorted(calls) == ["https://beta.ca", "https://boom.ca"] and j3["checked"] == 1, str(calls) + str(j3))

# --- simulate
newest = c.get("/api/watch").json()["watched_clinics"][0]
r = c.post("/api/watch/simulate-opening")  # no body
al = r.json().get("alert", {})
check("simulate default = newest watch", r.status_code == 200 and al["id"] == newest["id"] and al["new_status"] == "accepting"
      and al["simulated"] is True and "***" in al["user_email"] and "Good news" in al["message"], r.text)
check("simulate wrote accepting to SQLite", c.get("/api/watch").json()["watched_clinics"][0]["last_status"] == "accepting")
r = c.post("/api/watch/simulate-opening", json={})
check("simulate {} works + repeatable (old_status closed)", r.status_code == 200 and r.json()["alert"]["old_status"] == "closed", r.text)
r = c.post("/api/watch/simulate-opening", json={"watch_id": w2["id"]})
check("simulate by watch_id", r.json()["alert"]["clinic_name"] == "Beta" and r.json()["alert"]["old_status"] == "waitlist", r.text)
r = c.post("/api/watch/simulate-opening", json={"watch_id": 9999})
check("simulate unknown id -> 404", r.status_code == 404 and "9999" in r.json()["detail"])
r = c.post("/api/watch/simulate-opening", json={"watch_id": "abc"})
check("simulate bad id -> 422", r.status_code == 422)

# --- migration from the first watchdog version (no created_at / last_checked)
old = tmp / "old.db"
con = sqlite3.connect(old)
con.execute("CREATE TABLE watches (id INTEGER PRIMARY KEY AUTOINCREMENT, clinic_name TEXT, url TEXT, last_status TEXT, user_email TEXT, UNIQUE(url, user_email))")
con.execute("INSERT INTO watches (clinic_name, url, last_status, user_email) VALUES ('Old', 'https://old.ca', 'closed', 'o@x.ca')")
con.commit(); con.close()
wd.DB_PATH = old
rows = c.get("/api/watch", params={"user_email": "o@x.ca"}).json()["watched_clinics"]
check("old DB migrated (created_at filled, last_checked null)", len(rows) == 1 and ISO.match(rows[0]["created_at"] or "") and rows[0]["last_checked"] is None, str(rows))
check("old DB works for simulate", c.post("/api/watch/simulate-opening").json()["alert"]["clinic_name"] == "Old")

# --- persistence: data survives a fresh import (server restart)
import subprocess
code = ("import sys; sys.path.insert(0, r'%s'); import app.watchdog as wd; wd.DB_PATH = __import__('pathlib').Path(r'%s');"
        "print(len(wd.list_watches()))") % (BACKEND, tmp / "t.db")
out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True).stdout.strip()
check("persists across restart", out == "4", out)

# --- alert history, unwatch, background auto-check
wd.DB_PATH = tmp / "alerts.db"
scanning.scan_one = fake_scan_one
c.post("/api/watch", json={"clinic_name": "Alpha Clinic", "url": "https://alpha.ca", "last_status": "closed", "user_email": "alice@gmail.com"})
c.post("/api/watch", json={"clinic_name": "Beta", "url": "https://beta.ca", "last_status": "closed", "user_email": "bob@uwo.ca"})
check("no alerts yet", c.get("/api/watch/alerts").json() == {"alerts": []})
c.post("/api/watch/check")  # alpha -> accepting, beta -> waitlist
c.post("/api/watch/simulate-opening", json={"watch_id": 1})
hist = c.get("/api/watch/alerts").json()["alerts"]
check("history: 2 real + 1 simulated, newest first", len(hist) == 3 and hist[0]["simulated"] is True and not hist[1]["simulated"]
      and hist[0]["alert_id"] > hist[1]["alert_id"], str(hist))
check("history item shape", set(hist[0]) == {"alert_id", "id", "clinic_name", "url", "user_email", "old_status", "new_status",
                                             "evidence_quote", "message", "simulated", "created_at"} and ISO.match(hist[0]["created_at"]), str(hist[0]))
check("history masks emails without user_email", all("***" in a["user_email"] for a in hist))
mine = c.get("/api/watch/alerts", params={"user_email": "bob@uwo.ca"}).json()["alerts"]
check("history filtered + unmasked", len(mine) == 1 and mine[0]["user_email"] == "bob@uwo.ca" and mine[0]["new_status"] == "waitlist", str(mine))
check("history limit", len(c.get("/api/watch/alerts", params={"limit": 1}).json()["alerts"]) == 1)

r = c.delete("/api/watch/1", params={"user_email": "bob@uwo.ca"})
check("delete someone else's watch -> 404", r.status_code == 404 and len(wd.list_watches("alice@gmail.com")) == 1, r.text)
check("delete without user_email -> 422", c.delete("/api/watch/1").status_code == 422)
r = c.delete("/api/watch/1", params={"user_email": "alice@gmail.com"})
check("owner deletes watch", r.json() == {"deleted": True, "id": 1} and wd.list_watches("alice@gmail.com") == [], r.text)
check("alert history kept after unwatch", len(c.get("/api/watch/alerts", params={"user_email": "alice@gmail.com"}).json()["alerts"]) == 2)
r = c.options("/api/watch/2", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "DELETE"})
check("CORS allows DELETE", r.status_code == 200 and "DELETE" in r.headers.get("access-control-allow-methods", ""), str(r.headers))

import asyncio
runs = []
async def fake_check(user_email):
    runs.append(user_email)
    if len(runs) == 2:
        raise RuntimeError("one bad check")  # the loop must survive this
    return {"checked": 1, "failed": 0, "alerts": []}
real_check, watch_api.run_watch_check = watch_api.run_watch_check, fake_check
config.WATCHDOG_INTERVAL_MIN = 0.001  # ~0.06s
async def run_loop():
    try:
        await asyncio.wait_for(watch_api.watchdog_loop(), timeout=0.5)
    except asyncio.TimeoutError:
        pass
asyncio.run(run_loop())
check("background loop keeps checking, survives an error", len(runs) >= 3 and set(runs) == {None}, str(runs))
watch_api.run_watch_check = real_check
check("auto-check off by default", float(os.getenv("WATCHDOG_INTERVAL_MIN", "0") or 0) == 0)

check("real backend/clinics.db not created by tests", REAL_DB.exists() == real_db_existed)
print("\nALL PASSED" if not fails else "\nFAILED: " + str(fails))
