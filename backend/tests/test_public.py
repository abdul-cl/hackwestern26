"""Public demo mode (PUBLIC_DEMO=1): saved results only, live agents blocked, rate limit, admin key, CORS regex.
No network, no credits."""
import json, os, subprocess, sys, tempfile
from pathlib import Path
from types import SimpleNamespace as NS

BACKEND = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, BACKEND)
import os as _os, tempfile as _tempfile
_os.environ.setdefault("DATA_DIR", _tempfile.mkdtemp())  # never touch the real clinics.db
_os.environ.setdefault("CARESCOUT_SEED", "0")  # tests start with an empty clinic database
_os.environ.setdefault("DEMO_REPLAY", "0")  # never replay the real demo recording in tests
import app.main as m
from app import config, scanning, discovery, ranking, watchdog
from fastapi.testclient import TestClient

tmp = Path(tempfile.mkdtemp())
REAL_CACHE = config.CACHE_PATH
real_before = REAL_CACHE.read_bytes()
config.CACHE_PATH, watchdog.DB_PATH = tmp / "cache.json", tmp / "t.db"
os.environ["TINYFISH_API_KEY"] = "fake"
os.environ["GEMINI_API_KEY"] = "fake"
config.MAX_AGENTS = 50
c = TestClient(m.app, raise_server_exceptions=False).__enter__()
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else extra)
    if not cond:
        fails.append(name)


def clinic(u, status="accepting"):
    return {"name": u, "url": u, "status": status, "evidence_quote": "q", "waitlist_url": None, "raw_notes": "ok",
            "address": None, "lat": 43.0, "lng": -81.2, "distance_km": None}


def no_live(*a, **k):
    raise AssertionError("a live agent was started in public mode")


async def no_geo(*a, **k):
    return None


from app import geo
geo.geocode_address = geo.geocode_postal_code = no_geo
scanning.scan_one = lambda u: no_live()
discovery.discover = no_live
ranking_calls = []
real_rank = ranking.rank
ranking.rank = lambda req: (ranking_calls.append(req), {"ranked_clinics": []})[1]
config.CACHE_PATH.write_text(json.dumps({"clinics": [clinic("https://a.ca"), clinic("https://b.ca", "closed")]}), encoding="utf-8")

ADMIN = {"X-Admin-Key": "admin-secret"}
config.PUBLIC_DEMO, config.ADMIN_KEY, config.PUBLIC_RATE_LIMIT = True, "admin-secret", 1000

# --- health tells the website which mode it's in
check("health: public_demo true for visitors (Auto-Fill still available)", c.get("/health").json() == {"status": "ok", "public_demo": True, "apply": True})
check("health: public_demo false with admin key", c.get("/health", headers=ADMIN).json()["public_demo"] is False)
check("health: wrong admin key stays public", c.get("/health", headers={"X-Admin-Key": "nope"}).json()["public_demo"] is True)

# --- paid live endpoints are blocked for visitors
pi = {"name": "T", "email": "t@x.ca", "phone": "1", "postal_code": "N6A"}
for path, body in [("/api/apply", {"waitlist_url": "https://x.ca", "patient_info": pi}),
                   ("/api/verify-doctor", {"doctor_name": "Jane Smith"}),
                   ("/api/discover", {"city": "London, ON"}),
                   ("/api/watch/check", None)]:
    r = c.post(path, json=body) if body is not None else c.post(path)
    check(f"403 for visitors: {path}", r.status_code == 403 and "public demo" in r.json()["detail"], r.text)

# --- scans and missions are forced onto saved results
r = c.post("/api/scan", json={"use_cache": False, "clinic_urls": ["https://live.ca"]})
check("scan forced to saved results (no live agent)", r.status_code == 200 and [x["url"] for x in r.json()["clinics"]] == ["https://a.ca", "https://b.ca"], r.text)
r = c.post("/api/scan/stream", json={"use_cache": False})
ev = [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]
check("scan/stream forced to saved results", r.status_code == 200 and ev[-1] == {"type": "done", "total": 2}, r.text[:300])
r = c.post("/api/mission/stream", json={"use_cache": False, "city": "London, ON"})
ev = [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]
check("mission forced to saved results, still ranks", r.status_code == 200 and ev[-1]["type"] == "done"
      and sum(e["type"] == "clinic_scanned" for e in ev) == 2 and len(ranking_calls) == 1, str(ev)[:400])

# --- cheap endpoints still work for visitors
check("rank allowed", c.post("/api/rank", json={"clinics": []}).status_code == 200)
# --- watchlists on the public demo: only the shared demo account, only clinics from the database
from app import clinic_db
DEMO = config.DEMO_EMAIL
clinic_db.save_check("https://b.ca", "London, ON", clinic("https://b.ca", "closed"), None, "saved")
real_watch = watchdog.add_watch("Real Clinic", "https://b.ca", "closed", "real.person@x.ca")  # made before going public
w = {"clinic_name": "B", "url": "https://b.ca", "last_status": "closed", "user_email": "v@x.ca"}
r = c.post("/api/watch", json=w)
check("public: watching with your own email is 403 (no real emails stored)", r.status_code == 403 and DEMO in r.json()["detail"], r.text)
r = c.post("/api/watch", json={**w, "user_email": DEMO})
check("public: demo account can watch a database clinic", r.status_code == 200 and r.json()["user_email"] == DEMO, r.text)
demo_watch = r.json()
r = c.post("/api/watch", json={**w, "user_email": DEMO, "url": "https://attacker.example/page"})
check("public: can't watch a URL that isn't in the clinic database", r.status_code == 403, r.text)
check("public: can't read a real person's watches by email", c.get("/api/watch", params={"user_email": "real.person@x.ca"}).status_code == 403)
check("public: can't read a real person's alerts by email", c.get("/api/watch/alerts", params={"user_email": "real.person@x.ca"}).status_code == 403)
check("public: can't delete a real person's watch", c.delete(f"/api/watch/{real_watch['id']}", params={"user_email": "real.person@x.ca"}).status_code == 403)
check("public: demo account's own list works", [x["id"] for x in c.get("/api/watch", params={"user_email": DEMO}).json()["watched_clinics"]] == [demo_watch["id"]])
r = c.post("/api/watch/simulate-opening", json={"watch_id": real_watch["id"]})
check("public: simulate-opening can't fake an alert on a real person's watch", r.status_code == 404, r.text)
r = c.post("/api/watch/simulate-opening")
check("public: simulate-opening uses the demo account's watch", r.status_code == 200 and r.json()["alert"]["id"] == demo_watch["id"], r.text)
check("public: the real watch is untouched", watchdog.get_watch(real_watch["id"])["last_status"] == "closed")

# --- public missions: own URLs are ignored (never stored), auto-watch only for the demo account
before = clinic_db.count()
r = c.post("/api/mission/stream", json={"clinic_urls": ["https://attacker.example/a", "https://attacker.example/b"], "user_email": "v@x.ca"})
ev = [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]
check("public mission: visitor URLs are not added to the clinic database", clinic_db.get("https://attacker.example/a") is None and clinic_db.get("https://attacker.example/b") is None)
check("public mission: a visitor's own email is not auto-watched",
      any(e["type"] == "stage" and e["stage"] == "watch" and "demo account" in e["message"] for e in ev) and not any(e["type"] == "watched" for e in ev), str(ev)[-400:])
r = c.post("/api/mission/stream", json={"user_email": DEMO})
ev = [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]
check("public mission: the demo account auto-watches closed clinics", any(e["type"] == "watched" and e["count"] >= 1 for e in ev), str(ev)[-400:])

# --- the rate limit uses the address the host's proxy saw, not one the visitor wrote
config.PUBLIC_RATE_LIMIT = 2
m._hits.clear()
codes = [c.post("/api/rank", json={"clinics": []}, headers={"X-Forwarded-For": f"9.9.9.{i}, 5.5.5.5"}).status_code for i in range(3)]
check("rate limit: faking X-Forwarded-For doesn't give a fresh quota", codes == [200, 200, 429], str(codes))
for i in range(10_005):
    m._hits[f"10.{i}"] = m.deque([0.0])  # long idle visitors
m._hits["5.5.5.5"] = m.deque([m.time.monotonic()] * 2)
m._trim_hits(m.time.monotonic())
check("rate limit: trimming drops idle visitors but keeps active ones", "5.5.5.5" in m._hits and len(m._hits) == 1, str(len(m._hits)))
check("rate limit: still enforced after trimming", c.post("/api/rank", json={"clinics": []}, headers={"X-Forwarded-For": "5.5.5.5"}).status_code == 429)
config.PUBLIC_RATE_LIMIT = 1000
m._hits.clear()
check("watch list allowed", c.get("/api/watch").status_code == 200)

# --- missing saved results: a clear 503, never a silent live scan
saved = config.CACHE_PATH.read_text(encoding="utf-8")
config.CACHE_PATH.unlink()
for path in ("/api/scan", "/api/scan/stream"):
    r = c.post(path, json={})
    check(f"503 without saved results: {path}", r.status_code == 503 and "demo results" in r.json()["detail"], r.text)
# a city CareScout hasn't searched yet: searched live for visitors too (web search + checks), within a daily limit
from app import orchestrator
orchestrator._new_city_searches.clear()
config.PUBLIC_NEW_CITIES_PER_DAY = 1
r = c.post("/api/mission/stream", json={"city": "Nowhere, ON"})
ev = [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]
check("public: a new city is searched live (never another city's results)", r.status_code == 200
      and any("hasn't searched Nowhere" in e.get("message", "") for e in ev) and not any("Demo mode" in e.get("message", "") for e in ev), str(ev)[:300])
r = c.post("/api/mission/stream", json={"city": "Otherplace, ON"})
check("public: new-city searches have a daily limit (429)", r.status_code == 429 and "new-city searches" in r.json()["detail"], r.text)
config.PUBLIC_NEW_CITIES_PER_DAY = 20
config.CACHE_PATH.write_text(saved, encoding="utf-8")

# --- admin key unlocks live agents
scanning.scan_one = lambda u: clinic(u)
r = c.post("/api/scan", json={"clinic_urls": ["https://live.ca"]}, headers=ADMIN)
check("admin key: live scan runs", r.status_code == 200 and r.json()["clinics"][0]["url"] == "https://live.ca", r.text)
class Run:
    status, error, result = "COMPLETED", None, {"filled": {"Name": "T"}, "summary": "ok", "submitted": False}
config.tinyfish_client = lambda timeout: NS(agent=NS(run=lambda **kw: Run()))
r = c.post("/api/apply", json={"waitlist_url": "https://x.ca", "patient_info": pi}, headers=ADMIN)
check("admin key: apply allowed", r.status_code == 200 and r.json()["status"] == "ready_for_review", r.text)
scanning.scan_one = lambda u: no_live()

# --- rate limit per visitor (POSTs only; GETs and preflights are never limited)
m._hits.clear()
config.PUBLIC_RATE_LIMIT = 3
codes = [c.post("/api/rank", json={"clinics": []}, headers={"X-Forwarded-For": "1.1.1.1"}).status_code for _ in range(4)]
check("rate limit: 4th request in the window is 429", codes == [200, 200, 200, 429], str(codes))
check("rate limit is per visitor", c.post("/api/rank", json={"clinics": []}, headers={"X-Forwarded-For": "1.1.1.1, 2.2.2.2"}).status_code == 200)
check("GETs are not rate-limited", all(c.get("/api/watch", headers={"X-Forwarded-For": "1.1.1.1"}).status_code == 200 for _ in range(5)))
r = c.options("/api/rank", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST", "X-Forwarded-For": "1.1.1.1"})
check("CORS preflight not limited", r.status_code == 200)
check("admin is never rate-limited", c.post("/api/rank", json={"clinics": []}, headers={**ADMIN, "X-Forwarded-For": "1.1.1.1"}).status_code == 200)
check("429 has a readable message", "Too many requests" in c.post("/api/rank", json={"clinics": []}, headers={"X-Forwarded-For": "1.1.1.1"}).json()["detail"])

# --- public mode off: nothing changes
config.PUBLIC_DEMO = False
m._hits.clear()
scanning.scan_one = lambda u: clinic(u)
check("off: health public_demo false", c.get("/health").json()["public_demo"] is False)
r = c.post("/api/scan", json={"clinic_urls": ["https://live.ca"]})
check("off: live scan runs normally", r.status_code == 200 and r.json()["clinics"][0]["url"] == "https://live.ca", r.text)
check("off: no rate limit", all(c.post("/api/rank", json={"clinics": []}).status_code == 200 for _ in range(6)))

# --- CORS: ALLOWED_ORIGIN_REGEX (read at startup, so test in a fresh process)
code = (
    "import sys; sys.path.insert(0, r'%s'); import app.main as m; from fastapi.testclient import TestClient; c = TestClient(m.app);"
    "f = lambda o: c.options('/api/rank', headers={'Origin': o, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-admin-key'});"
    "a = f('https://1a2b3c4d-carescout.abdul.workers.dev'); b = f('https://evil.workers.dev'); l = f('http://localhost:5173');"
    "print(a.headers.get('access-control-allow-origin'), b.headers.get('access-control-allow-origin'), l.headers.get('access-control-allow-origin'), 'x-admin-key' in a.headers.get('access-control-allow-headers','').lower())"
) % BACKEND
env = {**os.environ, "ALLOWED_ORIGIN_REGEX": r"https://([a-z0-9-]+-)?carescout\.abdul\.workers\.dev"}
out = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True).stdout.strip().splitlines()[-1]
check("CORS regex allows matching Cloudflare preview URLs only, localhost still works, X-Admin-Key allowed",
      out == "https://1a2b3c4d-carescout.abdul.workers.dev None http://localhost:5173 True", out)

ranking.rank = real_rank
check("real fallback_cache.json untouched", REAL_CACHE.read_bytes() == real_before)
print("\nALL PASSED" if not fails else "\nFAILED: " + str(fails))
