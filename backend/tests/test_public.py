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
check("health: public_demo true for visitors", c.get("/health").json() == {"status": "ok", "public_demo": True})
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
r = c.post("/api/mission/stream", json={"use_cache": False, "city": "Toronto"})
ev = [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]
check("mission forced to saved results, still ranks", r.status_code == 200 and ev[-1]["type"] == "done"
      and sum(e["type"] == "clinic_scanned" for e in ev) == 2 and len(ranking_calls) == 1, str(ev)[:400])

# --- cheap endpoints still work for visitors
check("rank allowed", c.post("/api/rank", json={"clinics": []}).status_code == 200)
w = {"clinic_name": "B", "url": "https://b.ca", "last_status": "closed", "user_email": "v@x.ca"}
check("watch allowed", c.post("/api/watch", json=w).status_code == 200)
check("simulate-opening allowed", c.post("/api/watch/simulate-opening").status_code == 200)
check("watch list allowed", c.get("/api/watch").status_code == 200)

# --- missing saved results: a clear 503, never a silent live scan
saved = config.CACHE_PATH.read_text(encoding="utf-8")
config.CACHE_PATH.unlink()
for path in ("/api/scan", "/api/scan/stream", "/api/mission/stream"):
    r = c.post(path, json={})
    check(f"503 without saved results: {path}", r.status_code == 503 and "demo results" in r.json()["detail"], r.text)
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
check("rate limit is per visitor", c.post("/api/rank", json={"clinics": []}, headers={"X-Forwarded-For": "2.2.2.2, 10.0.0.1"}).status_code == 200)
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
    "a = f('https://carescout-git-main-abdul.vercel.app'); b = f('https://evil.vercel.app'); l = f('http://localhost:5173');"
    "print(a.headers.get('access-control-allow-origin'), b.headers.get('access-control-allow-origin'), l.headers.get('access-control-allow-origin'), 'x-admin-key' in a.headers.get('access-control-allow-headers','').lower())"
) % BACKEND
env = {**os.environ, "ALLOWED_ORIGIN_REGEX": r"https://carescout-[a-z0-9-]+\.vercel\.app"}
out = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True).stdout.strip().splitlines()[-1]
check("CORS regex allows matching Vercel URLs only, localhost still works, X-Admin-Key allowed",
      out == "https://carescout-git-main-abdul.vercel.app None http://localhost:5173 True", out)

ranking.rank = real_rank
check("real fallback_cache.json untouched", REAL_CACHE.read_bytes() == real_before)
print("\nALL PASSED" if not fails else "\nFAILED: " + str(fails))
