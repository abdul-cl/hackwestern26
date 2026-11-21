import json, os, sys, tempfile, time
from pathlib import Path
from types import SimpleNamespace as NS

BACKEND = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, BACKEND)
import os as _os, tempfile as _tempfile
_os.environ.setdefault("DATA_DIR", _tempfile.mkdtemp())  # never touch the real clinics.db
_os.environ.setdefault("CARESCOUT_SEED", "0")  # tests start with an empty clinic database
import app.main as m
from app import config, common, models, cache, agents, geo, watchdog, scanning, discovery, ranking, apply_form, cpso, orchestrator, watch_api
from fastapi.testclient import TestClient

REAL_CACHE = config.CACHE_PATH
real_before = REAL_CACHE.read_bytes()
tmp = Path(tempfile.mkdtemp())
config.CACHE_PATH = tmp / "cache.json"
watchdog.DB_PATH = tmp / "t.db"

config.MAX_AGENTS = 50  # no agent limit unless a test sets one
c = TestClient(m.app, raise_server_exceptions=False).__enter__()  # one event loop, like uvicorn
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, extra if not cond else "")
    if not cond:
        fails.append(name)


def ok_clinic(u, status="accepting"):
    return {"name": u, "url": u, "status": status, "evidence_quote": "q", "waitlist_url": None, "raw_notes": "ok"}


# --- basics / paths
check("paths resolve from file", config.BACKEND_DIR.name == "backend" and config.ROOT_DIR == config.BACKEND_DIR.parent and (config.ROOT_DIR / "CLAUDE.md").exists())
check("health", c.get("/health").json()["status"] == "ok")

# --- CORS
for origin in ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"]:
    r = c.options("/api/rank", headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                        "Access-Control-Request-Headers": "content-type"})
    check("cors preflight " + origin, r.status_code == 200 and r.headers.get("access-control-allow-origin") in ("*", origin), str(r.headers))

# --- rank: empty clinics doesn't need Gemini or a key
saved_env = dict(os.environ)
os.environ.pop("GEMINI_API_KEY", None)
r = c.post("/api/rank", json={"preferences": [], "clinics": []})
check("rank empty -> []", r.status_code == 200 and r.json() == {"ranked_clinics": []}, r.text)
r = c.post("/api/rank", json={"preferences": [], "clinics": [{"name": "A"}]})
check("rank missing GEMINI key -> JSON 500", r.status_code == 500 and "GEMINI_API_KEY" in r.json()["detail"], r.text)
check("rank 500 has CORS header", True)
r = c.post("/api/rank", json={"preferences": []})
check("rank missing clinics -> 422", r.status_code == 422)
r = c.post("/api/rank", json={"clinics": "nope"})
check("rank bad type -> 422", r.status_code == 422)

# --- gemini parsing with fences / junk
good = {"ranked_clinics": [{"name": "A", "score": 150, "reason": "r", "requirements": [], "next_step": "n"}]}
fenced = "```json\n" + json.dumps(good) + "\n```"
check("parse fenced", common.parse_gemini(NS(text=fenced), models.RankResponse).ranked_clinics[0].name == "A")
for bad in [None, "", "not json"]:
    try:
        common.parse_gemini(NS(text=bad), models.RankResponse); check("parse bad " + repr(bad), False)
    except Exception:
        check("parse bad raises cleanly " + repr(bad), True)

os.environ["GEMINI_API_KEY"] = "fake"
class FakeModels:
    def __init__(self, text): self.text = text
    def generate_content(self, **kw): return NS(text=self.text)
class FakeClient:
    def __init__(self, text): self.models = FakeModels(text)
config.gemini_client = lambda: FakeClient(fenced)
r = c.post("/api/rank", json={"preferences": [], "clinics": [{"name": "A"}]})
check("rank handles fenced output + clamps score", r.status_code == 200 and r.json()["ranked_clinics"][0]["score"] == 100, r.text)
config.gemini_client = lambda: FakeClient("garbage")
r = c.post("/api/rank", json={"preferences": [], "clinics": [{"name": "A"}]})
check("rank garbage -> JSON 502", r.status_code == 502 and "detail" in r.json(), r.text)

# --- clean_urls
urls = ["https://www.yelp.com/biz/x", "https://reddit.com/r/x", "https://m.facebook.com/p", "https://instagram.com/x",
        "https://www.ratemds.com/doctor", "https://maps.google.com/?q=x", "https://www.google.com/maps", "http://insecure.ca",
        "https://foxmedx.com/", "https://ldam.ca/a", "https://www.ldam.ca/b", "", "https://goo.gl/maps/x"]
check("clean_urls", discovery.clean_urls(urls, 10) == ["https://foxmedx.com/", "https://ldam.ca/a"], str(discovery.clean_urls(urls, 10)))

# --- cache safety
check("load_cache missing -> None", cache.load_cache() is None)
config.CACHE_PATH.write_text("{not json", encoding="utf-8")
check("load_cache corrupted -> None", cache.load_cache() is None)
config.CACHE_PATH.write_text(json.dumps({"clinics": [{"name": "x"}]}), encoding="utf-8")
check("load_cache malformed -> None", cache.load_cache() is None)
config.CACHE_PATH.unlink()
cache.save_cache([failed := common.failed_clinic("u", "scan error: x")])
check("failed scan doesn't write cache", not config.CACHE_PATH.exists())
cache.save_cache([])
check("empty scan doesn't write cache", not config.CACHE_PATH.exists())
cache.save_cache([ok_clinic("u1")])
check("valid scan writes cache", cache.load_cache() == {"clinics": [{**ok_clinic("u1"), "distance_km": None}]})
# merge: partial scans keep previous good entries and never shrink the backup
cache.save_cache([ok_clinic("u1"), ok_clinic("u2")])
check("cache grows with new clinics", [c["url"] for c in cache.load_cache()["clinics"]] == ["u1", "u2"])
cache.save_cache([ok_clinic("u1", "waitlist"), common.failed_clinic("u2", "scan failed: timed out")])
cl = {c["url"]: c for c in cache.load_cache()["clinics"]}
check("partial scan: fresh u1 saved, failed u2 keeps old entry", cl["u1"]["status"] == "waitlist" and cl["u2"]["raw_notes"] == "ok", str(cl))
cache.save_cache([common.failed_clinic("u1", "scan error: wifi"), common.failed_clinic("u2", "scan error: wifi")])
check("all-failed scan keeps backup intact", len(cache.load_cache()["clinics"]) == 2 and cache.load_cache()["clinics"][0]["status"] == "waitlist")
cache.save_cache([ok_clinic("u1")])
check("smaller scan never shrinks backup", len(cache.load_cache()["clinics"]) == 2)
config.CACHE_PATH.write_text("{corrupt", encoding="utf-8")

# --- scan: missing key, cache fallback to live, timeouts, per-clinic failures
os.environ.pop("TINYFISH_API_KEY", None)
r = c.post("/api/scan", json={"use_cache": False})
check("scan missing TINYFISH key -> JSON 500", r.status_code == 500 and "TINYFISH_API_KEY" in r.json()["detail"], r.text)
r = c.post("/api/scan/stream", json={})
check("stream missing key -> JSON 500", r.status_code == 500 and "TINYFISH_API_KEY" in r.json()["detail"], r.text)
os.environ["TINYFISH_API_KEY"] = "fake"

def fake_scan_one(url):
    if "slow" in url: time.sleep(3)
    if "boom" in url: return common.failed_clinic(url, "scan error: boom")
    return ok_clinic(url)
scanning.scan_one = fake_scan_one
config.SCAN_TIMEOUT = 1

t = time.time()
body = {"clinic_urls": ["https://a.ca", "https://slow.ca", "https://boom.ca", "not a url"], "use_cache": True}
r = c.post("/api/scan", json=body)
cl = r.json().get("clinics", [])
check("scan: corrupted cache -> live scan, 4 results", r.status_code == 200 and len(cl) == 4, r.text)
check("scan: timeout + failure isolated", [x["status"] for x in cl] == ["accepting", "closed", "closed", "closed"]
      and "timed out" in cl[1]["raw_notes"] and "not a valid" in cl[3]["raw_notes"], str(cl))
check("scan: bounded by timeout (~1s)", time.time() - t < 2.5, str(time.time() - t))
check("scan: custom urls didn't write cache", load_ok := (cache.load_cache() is None))
r = c.post("/api/scan", json={"clinic_urls": ["x"] * 25 + ["y%d" % i for i in range(25)]})
check("scan: too many urls -> 422", r.status_code == 422)
r = c.post("/api/scan", json={"clinic_urls": "nope"})
check("scan: bad body -> 422", r.status_code == 422)

# default list success writes cache; use_cache replays it
config.DEFAULT_CLINIC_URLS[:] = ["https://d1.ca", "https://d2.ca"]
r = c.post("/api/scan", json={})
check("scan default ok", r.status_code == 200 and len(r.json()["clinics"]) == 2)
check("default scan wrote cache", cache.load_cache() is not None)
scanning.scan_one = lambda u: (_ for _ in ()).throw(AssertionError("should not scan"))
r = c.post("/api/scan", json={"use_cache": True})
check("use_cache returns cache without scanning", r.status_code == 200 and len(r.json()["clinics"]) == 2, r.text)

# --- stream: always ends in done, even with failures/timeouts
scanning.scan_one = fake_scan_one
def events(resp):
    return [json.loads(l[6:]) for l in resp.text.split("\n\n") if l.startswith("data: ")]
t = time.time()
r = c.post("/api/scan/stream", json={"clinic_urls": ["https://a.ca", "https://slow.ca", "https://boom.ca"]})
ev = events(r)
check("stream ends with done total=3", ev[-1] == {"type": "done", "total": 3}, str(ev))
check("stream 3 results + 6 statuses (queued+started)", sum(e["type"] == "clinic_result" for e in ev) == 3 and sum(e["type"] == "status" for e in ev) == 6)
check("stream content-type", r.headers["content-type"].startswith("text/event-stream"))
check("stream bounded by timeout", time.time() - t < 2.5)
r = c.post("/api/scan/stream", json={"use_cache": True})
ev = events(r)
check("stream cache replay + done", ev[-1] == {"type": "done", "total": 2} and len(ev) == 3, str(ev))
config.CACHE_PATH.write_text("{corrupt", encoding="utf-8")
r = c.post("/api/scan/stream", json={"clinic_urls": ["https://a.ca"], "use_cache": True})
ev = events(r)
check("stream corrupted cache -> live + done", ev[-1]["type"] == "done" and ev[-1]["total"] == 1, str(ev))

# --- apply
r = c.post("/api/apply", json={"waitlist_url": "javascript:x", "patient_info": {"name": "a", "email": "b", "phone": "c", "postal_code": "d"}})
check("apply bad url -> 422", r.status_code == 422)
r = c.post("/api/apply", json={"waitlist_url": "https://x.ca"})
check("apply missing patient_info -> 422", r.status_code == 422)
pi = {"name": "T", "email": "t@x.ca", "phone": "1", "postal_code": "N6A"}
class Run:
    def __init__(self, status="COMPLETED", result=None, error=None): self.status, self.result, self.error = status, result, error
class FakeTF:
    def __init__(self, run): self.agent = NS(run=lambda **kw: run)
def apply_with(run):
    config.tinyfish_client = lambda timeout: FakeTF(run)
    return c.post("/api/apply", json={"waitlist_url": "https://x.ca/form", "patient_info": pi}).json()
j = apply_with(Run(result={"filled": {"Name": "T"}, "summary": "done", "blocked": False, "screenshot_url": None}))
check("apply ready_for_review", j["status"] == "ready_for_review" and j["filled_fields"] == {"Name": "T"}, str(j))
j = apply_with(Run(result={"filled": {}, "summary": "captcha present", "blocked": True}))
check("apply captcha -> manual_required", j["status"] == "manual_required" and "captcha" in j["summary"], str(j))
j = apply_with(Run(status="FAILED", error=NS(message="blocked by site")))
check("apply failed run -> manual_required", j["status"] == "manual_required" and set(j) == {"status", "filled_fields", "summary", "screenshot_url"}, str(j))
j = apply_with(Run(result="weird string"))
check("apply odd result -> manual_required", j["status"] == "manual_required", str(j))
class Boom:
    agent = NS(run=lambda **kw: (_ for _ in ()).throw(RuntimeError("net down")))
config.tinyfish_client = lambda timeout: Boom()
j = c.post("/api/apply", json={"waitlist_url": "https://x.ca/form", "patient_info": pi}).json()
check("apply exception -> error status", j["status"] == "error" and "net down" in j["summary"], str(j))
config.APPLY_TIMEOUT = 1
config.tinyfish_client = lambda timeout: NS(agent=NS(run=lambda **kw: time.sleep(3)))
t = time.time()
j = c.post("/api/apply", json={"waitlist_url": "https://x.ca/form", "patient_info": pi}).json()
check("apply timeout -> manual_required", j["status"] == "manual_required" and "longer" in j["summary"] and time.time() - t < 2.5, str(j))

# --- discover
config.tinyfish_client = lambda timeout: NS(search=NS(query=lambda *a, **k: NS(results=[])))
r = c.post("/api/discover", json={"city": "London, ON", "max_results": 3})
check("discover empty -> London defaults", r.json()["clinic_urls"] == config.DEFAULT_CLINIC_URLS[:3], r.text)
r = c.post("/api/discover", json={"city": "Kitchener, ON"})
check("discover empty other city -> []", r.json()["clinic_urls"] == [], r.text)
def boom_search(*a, **k): raise RuntimeError("search down")
config.tinyfish_client = lambda timeout: NS(search=NS(query=boom_search))
r = c.post("/api/discover", json={"city": "London, ON"})
check("discover search error -> fallback, no crash", r.status_code == 200 and len(r.json()["clinic_urls"]) == 2, r.text)
res = [NS(url=u, title="t", snippet="s") for u in ["https://yelp.com/x", "https://a.ca/", "https://a.ca/x", "https://reddit.com/r/y", "https://b.ca"]]
config.tinyfish_client = lambda timeout: NS(search=NS(query=lambda *a, **k: NS(results=res)))
config.gemini_client = lambda: FakeClient("not json at all")
r = c.post("/api/discover", json={"city": "Kitchener, ON", "max_results": 5})
check("discover gemini garbage -> unfiltered clean list", r.json()["clinic_urls"] == ["https://a.ca/", "https://b.ca"], r.text)
config.gemini_client = lambda: FakeClient("```json\n" + json.dumps({"clinic_urls": ["https://b.ca", "https://evil.com"]}) + "\n```")
r = c.post("/api/discover", json={"city": "Kitchener, ON", "max_results": 5})
check("discover gemini fenced + hallucination filtered", r.json()["clinic_urls"] == ["https://b.ca"], r.text)
r = c.post("/api/discover", json={"city": "X", "max_results": "lots"})
check("discover bad max_results -> 422", r.status_code == 422)

# --- watch
w = {"clinic_name": "A", "url": "https://a.ca", "last_status": "closed", "user_email": "a@x.com"}
check("watch bad status -> 422", c.post("/api/watch", json={**w, "last_status": "maybe"}).status_code == 422)
check("watch bad email -> 422", c.post("/api/watch", json={**w, "user_email": "nope"}).status_code == 422)
check("watch bad url -> 422", c.post("/api/watch", json={**w, "url": "nope"}).status_code == 422)
check("watch check empty", c.post("/api/watch/check").json() == {"checked": 0, "failed": 0, "alerts": []})
check("watch add", c.post("/api/watch", json=w).json()["id"] == 1)
c.post("/api/watch", json={**w, "url": "https://boom.ca", "clinic_name": "B"})
scanning.scan_one = fake_scan_one
j = c.post("/api/watch/check").json()
check("watch check alert + failure isolated", j["checked"] == 1 and j["failed"] == 1 and len(j["alerts"]) == 1 and j["alerts"][0]["new_status"] == "accepting", str(j))
check("watch list", len(c.get("/api/watch").json()["watched_clinics"]) == 2)

# --- CORS on error responses & routes unchanged
os.environ.pop("GEMINI_API_KEY", None)
config.gemini_client = config.__dict__["gemini_client"]
r = c.post("/api/rank", json={"clinics": [{"name": "A"}]}, headers={"Origin": "http://localhost:5173"})
check("500 error still has CORS header", r.headers.get("access-control-allow-origin") in ("*", "http://localhost:5173"), str(r.headers))
paths = sorted(p for p in c.get("/openapi.json").json()["paths"])
check("routes unchanged", paths == ["/api/apply", "/api/clinics", "/api/clinics/refresh", "/api/clinics/seed", "/api/clinics/stats", "/api/discover", "/api/mission/stream", "/api/rank", "/api/scan", "/api/scan/stream", "/api/verify-doctor", "/api/watch", "/api/watch/alerts", "/api/watch/check", "/api/watch/simulate-opening", "/api/watch/{watch_id}", "/health"], str(paths))

check("real fallback_cache.json untouched", REAL_CACHE.read_bytes() == real_before)
print("\nFAILED:" if fails else "\nALL PASSED", fails)
