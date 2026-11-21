"""POST /api/mission/stream with stubbed discover / TinyFish / Gemini. No network, no credits."""
import json, os, sys, tempfile
from pathlib import Path

from fastapi import HTTPException

BACKEND = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, BACKEND)
import app.main as m
import app.watchdog as wd
from fastapi.testclient import TestClient

tmp = Path(tempfile.mkdtemp())
REAL_CACHE = m.CACHE_PATH
real_before = REAL_CACHE.read_bytes()
m.CACHE_PATH, wd.DB_PATH = tmp / "cache.json", tmp / "t.db"
os.environ["TINYFISH_API_KEY"] = "fake"
m.MAX_AGENTS = 50
c = TestClient(m.app, raise_server_exceptions=False).__enter__()
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else extra)
    if not cond:
        fails.append(name)


STATUS = {"https://open.ca": "accepting", "https://wait.ca": "waitlist", "https://full1.ca": "closed", "https://full2.ca": "closed"}
def fake_scan_one(url):
    if "boom" in url:
        return m.failed_clinic(url, "scan error: blocked")
    return {"name": url.split("//")[1].split(".")[0].title() + " Clinic", "url": url, "status": STATUS[url], "evidence_quote": "q",
            "waitlist_url": None, "raw_notes": "ok", "address": None, "lat": None, "lng": None, "distance_km": None}
m.scan_one = fake_scan_one


async def no_geo(*a, **k):  # keep tests offline: no Nominatim calls
    return None
import app.geo as geo
geo.geocode_address = geo.geocode_postal_code = m.geocode_postal_code = no_geo

discover_calls = []
def fake_discover(req):
    discover_calls.append(req)
    return {"city": req.city, "clinic_urls": list(STATUS) + ["https://boom.ca"]}
m.discover = fake_discover

rank_calls = []
def fake_rank(req):
    rank_calls.append(req)
    return {"ranked_clinics": [{"name": x["name"], "url": x["url"], "score": 90 - i, "reason": "r", "requirements": [], "next_step": "n",
                                "coverage_tags": [], "phone_number": None, "call_hours": None, "call_script": None}
                               for i, x in enumerate(req.clinics)]}
m.rank = fake_rank


def mission(**body):
    r = c.post("/api/mission/stream", json=body)
    if r.status_code != 200:
        return r.status_code, r.json()
    return 200, [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]


# --- full pipeline
code, ev = mission(user_email="pat@x.ca", preferences=["female doctor"], language="French", coverage_type="UHIP")
types = [e["type"] for e in ev]
check("200 + done is last and only once", code == 200 and types[-1] == "done" and types.count("done") == 1, str(types))
stages = [e["stage"] for e in ev if e["type"] == "stage"]
check("stages in order", stages == ["discover", "scan", "rank", "watch"], str(stages))
check("discovered urls", ev[types.index("discovered")]["urls"] == list(STATUS) + ["https://boom.ca"])
check("scan message counts clinics", "5 clinics" in ev[types.index("stage", types.index("discovered"))]["message"])
check("5 clinic_scanned + agent_status events", types.count("clinic_scanned") == 5 and types.count("agent_status") == 10, str(types))
check("clinic_scanned before rank", max(i for i, t in enumerate(types) if t == "clinic_scanned") < types.index("ranked"))
check("rank got language/coverage/preferences + all clinics", rank_calls[-1].language == "French" and rank_calls[-1].coverage_type == "UHIP"
      and rank_calls[-1].preferences == ["female doctor"] and len(rank_calls[-1].clinics) == 5)
w = ev[types.index("watched")]
check("only real closed clinics watched (not failed)", w["count"] == 2 and sorted(x["url"] for x in w["clinics"]) == ["https://full1.ca", "https://full2.ca"], str(w))
check("watch records saved in SQLite", len(wd.list_watches("pat@x.ca")) == 2 and all(x["last_status"] == "closed" for x in wd.list_watches("pat@x.ca")))
s = ev[-1]["summary"]
check("summary counts", (s["total_scanned"], s["accepting_count"], s["waitlist_count"], s["closed_count"], s["failed_count"], s["watched_count"], s["ranked"])
      == (5, 1, 1, 2, 1, 2, True), str(s))
check("summary top_clinic = first ranked", s["top_clinic"] == ev[types.index("ranked")]["ranked_clinics"][0]["name"], str(s))

code, ev = mission(user_email="pat@x.ca")
check("re-running doesn't duplicate watches", len(wd.list_watches("pat@x.ca")) == 2)

# --- watch skipped
code, ev = mission()
check("no email -> watch skipped, watched_count 0", "watched" not in [e["type"] for e in ev]
      and any(e.get("stage") == "watch" and "skipped" in e["message"] for e in ev) and ev[-1]["summary"]["watched_count"] == 0)
code, ev = mission(user_email="pat@x.ca", auto_watch_closed=False)
check("auto_watch_closed false -> skipped", "watched" not in [e["type"] for e in ev])

# --- discover fails
def broken_discover(req): raise RuntimeError("search down")
m.discover = broken_discover
code, ev = mission(city="London, ON")
types = [e["type"] for e in ev]
check("discover error -> error event, London defaults, still done", "error" in types and ev[types.index("discovered")]["urls"] == m.DEFAULT_CLINIC_URLS
      and types[-1] == "done", str(types))
m.scan_one = lambda u: m.failed_clinic(u, "scan error: x")
code, ev = mission(city="Kitchener, ON")
types = [e["type"] for e in ev]
check("non-London + nothing found -> empty scan, rank error, done", ev[types.index("discovered")]["urls"] == [] and types[-1] == "done"
      and any(e.get("stage") == "rank" and e["type"] == "error" for e in ev) and ev[-1]["summary"]["total_scanned"] == 0, str(ev))
m.scan_one, m.discover = fake_scan_one, fake_discover

# --- rank fails
def broken_rank(req): raise HTTPException(status_code=502, detail="rank failed: gemini down")
m.rank = broken_rank
code, ev = mission(user_email="pat@x.ca")
types = [e["type"] for e in ev]
check("rank error -> error event, watch still runs, done", "ranked" not in types and "watched" in types and types[-1] == "done"
      and any(e["type"] == "error" and "gemini down" in e["message"] for e in ev) and ev[-1]["summary"]["ranked"] is False, str(types))
m.rank = fake_rank

# --- custom urls skip discovery
discover_calls.clear()
code, ev = mission(clinic_urls=["https://open.ca", "https://open.ca", "https://wait.ca"])
check("clinic_urls skips discover, deduped", discover_calls == [] and [e for e in ev if e["type"] == "discovered"][0]["urls"] == ["https://open.ca", "https://wait.ca"])

# --- cache mode (no TinyFish key needed, no discover, no scan)
cached = [fake_scan_one(u) for u in ["https://open.ca", "https://full1.ca"]]
m.CACHE_PATH.write_text(json.dumps({"clinics": cached}), encoding="utf-8")
os.environ.pop("TINYFISH_API_KEY")
discover_calls.clear()
m.scan_one = lambda u: (_ for _ in ()).throw(AssertionError("must not scan"))
code, ev = mission(use_cache=True, user_email="cache@x.ca")
types = [e["type"] for e in ev]
check("cache mode works without TinyFish key", code == 200 and types.count("clinic_scanned") == 2 and discover_calls == [] and types[-1] == "done", str(ev)[:300])
check("cache mode still ranks + watches", "ranked" in types and ev[types.index("watched")]["count"] == 1)
code, j = mission()
check("live mode without key -> JSON 500 before stream", code == 500 and "TINYFISH_API_KEY" in j["detail"], str(j))
os.environ["TINYFISH_API_KEY"] = "fake"
m.scan_one = fake_scan_one

# --- validation
check("bad email -> 422", mission(user_email="nope")[0] == 422)
check("too many urls -> 422", mission(clinic_urls=[f"https://x{i}.ca" for i in range(21)])[0] == 422)
check("oversize preferences -> 422", mission(preferences=["x"] * 21)[0] == 422)

# --- existing endpoints untouched
paths = sorted(c.get("/openapi.json").json()["paths"])
for p in ["/api/discover", "/api/scan", "/api/scan/stream", "/api/rank", "/api/apply", "/api/watch", "/api/verify-doctor", "/api/mission/stream"]:
    check("route exists " + p, p in paths)
check("real fallback_cache.json untouched", REAL_CACHE.read_bytes() == real_before)
print("\nALL PASSED" if not fails else "\nFAILED: " + str(fails))
