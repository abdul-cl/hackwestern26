"""Agent concurrency limit, queued/started stream events, and /api/rank url filling. No network, no credits."""
import json, os, sys, tempfile, threading, time
from pathlib import Path
from types import SimpleNamespace as NS

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

tmp = Path(tempfile.mkdtemp())
config.CACHE_PATH, wd.DB_PATH = tmp / "cache.json", tmp / "t.db"
os.environ["TINYFISH_API_KEY"] = "fake"
os.environ["GEMINI_API_KEY"] = "fake"
config.MAX_AGENTS = 2
c = TestClient(m.app, raise_server_exceptions=False).__enter__()  # one event loop, like uvicorn
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else extra)
    if not cond:
        fails.append(name)


running, peak, lock = 0, 0, threading.Lock()


def fake_scan_one(url, seconds=0.5):
    global running, peak
    with lock:
        running += 1
        peak = max(peak, running)
    try:
        time.sleep(3 if "slow" in url else seconds)
        return {"name": url, "url": url, "status": "accepting", "evidence_quote": "", "waitlist_url": None,
                "raw_notes": "ok", "address": None, "lat": None, "lng": None, "distance_km": None}
    finally:
        with lock:
            running -= 1


scanning.scan_one = fake_scan_one
urls = [f"https://c{i}.ca" for i in range(4)]

# --- at most MAX_AGENTS run at once; queued clinics are not timed out
config.SCAN_TIMEOUT = 0.8  # shorter than the total queue time (4 x 0.5s / 2 = 1.0s) but longer than one run
t = time.time()
r = c.post("/api/scan", json={"clinic_urls": urls})
dt = time.time() - t
cl = r.json()["clinics"]
check("never more than 2 agents at once", peak == 2, str(peak))
check("4 scans at 2-wide take ~1.0s", 0.9 < dt < 1.8, str(dt))
check("queue time doesn't count toward timeout", all(x["raw_notes"] == "ok" for x in cl), str([x["raw_notes"] for x in cl]))

# --- a timed-out agent keeps its slot until its thread really finishes
peak = 0
config.SCAN_TIMEOUT = 0.5
t = time.time()
r = c.post("/api/scan", json={"clinic_urls": ["https://slow1.ca", "https://slow2.ca"]})
check("slow scans time out", all("timed out" in x["raw_notes"] for x in r.json()["clinics"]), r.text)
config.SCAN_TIMEOUT = 5
t = time.time()
r = c.post("/api/scan", json={"clinic_urls": ["https://after.ca"]})
waited = time.time() - t
check("next scan waits for the timed-out agents to finish (limit respected)", waited > 1.5 and peak <= 2, f"{waited:.2f}s peak={peak}")

# --- stream: queued then started then result for every clinic, done last
time.sleep(3)  # let leftovers drain
peak = 0
r = c.post("/api/scan/stream", json={"clinic_urls": urls})
ev = [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]
check("stream ends with done", ev[-1] == {"type": "done", "total": 4}, str(ev[-1]))
ok = True
for u in urls:
    seq = [e.get("message", e["type"]) for e in ev if e.get("url") == u or e.get("clinic", {}).get("url") == u]
    ok &= seq == ["Queued: waiting for a free agent...", "Agent started scanning...", "clinic_result"]
check("per-clinic order: queued -> started -> result", ok, str(ev))
# (a 3rd "started" may arrive before the 1st result: the slot frees as soon as the agent finishes,
#  while that clinic is still being geocoded. What matters is how many agents actually ran at once.)
check("stream: never more than 2 agents at once", peak == 2, str(peak))

# --- apply also uses the agent limit and its timeout excludes queue time
config.APPLY_TIMEOUT = 0.8
class Run:
    def __init__(self): self.status, self.error = "COMPLETED", None; self.result = {"filled": {"Name": "T"}, "summary": "ok", "submitted": False}
def slow_run(**kw):
    time.sleep(0.5)
    return Run()
config.tinyfish_client = lambda timeout: NS(agent=NS(run=slow_run))
pi = {"name": "T", "email": "t@x.ca", "phone": "1", "postal_code": "N6A 1A1"}
import concurrent.futures as cf
with cf.ThreadPoolExecutor(4) as ex:
    res = list(ex.map(lambda _: c.post("/api/apply", json={"waitlist_url": "https://x.ca/f", "patient_info": pi}).json(), range(4)))
check("4 concurrent applies all succeed behind the limit", all(x["status"] == "ready_for_review" for x in res), str(res))

# --- rank: url filled from input data, never invented
ranked = {"ranked_clinics": [
    {"name": "Alpha Clinic", "url": None, "score": 90, "reason": "r", "requirements": [], "next_step": "n"},
    {"name": "beta clinic ", "url": "https://wrong.ca", "score": 50, "reason": "r", "requirements": [], "next_step": "n"},
    {"name": "Renamed By Model", "url": "https://gamma.ca", "score": 40, "reason": "r", "requirements": [], "next_step": "n"},
    {"name": "Invented", "url": "https://invented.ca", "score": 30, "reason": "r", "requirements": [], "next_step": "n"},
]}
config.gemini_client = lambda: NS(models=NS(generate_content=lambda **kw: NS(text=json.dumps(ranked))))
inp = [{"name": "Alpha Clinic", "url": "https://alpha.ca"}, {"name": "Beta Clinic", "url": "https://beta.ca"},
       {"name": "Gamma", "url": "https://gamma.ca"}]
out = {x["name"]: x["url"] for x in c.post("/api/rank", json={"clinics": inp}).json()["ranked_clinics"]}
check("rank url: exact name", out["Alpha Clinic"] == "https://alpha.ca", str(out))
check("rank url: case-insensitive name beats model url", out["beta clinic "] == "https://beta.ca", str(out))
check("rank url: model url kept only if it's an input url", out["Renamed By Model"] == "https://gamma.ca" and out["Invented"] is None, str(out))

print("\nALL PASSED" if not fails else "\nFAILED: " + str(fails))
