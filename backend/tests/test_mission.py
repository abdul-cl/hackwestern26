"""POST /api/mission/stream (database-first) with stubbed web search / page reads / agents / Gemini.
No network, no credits."""
import contextlib, json, os, sys, tempfile
from pathlib import Path

from fastapi import HTTPException

BACKEND = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, BACKEND)
import os as _os, tempfile as _tempfile
_os.environ.setdefault("DATA_DIR", _tempfile.mkdtemp())  # never touch the real clinics.db
_os.environ.setdefault("CARESCOUT_SEED", "0")  # tests start with an empty clinic database
_os.environ.setdefault("DEMO_REPLAY", "0")  # never replay the real demo recording in tests
import app.main as m
from app import config, common, models, geo, watchdog, scanning, discovery, ranking, clinic_db, refresh
from fastapi.testclient import TestClient

tmp = Path(tempfile.mkdtemp())
REAL_CACHE = config.CACHE_PATH
real_before = REAL_CACHE.read_bytes()
config.CACHE_PATH = tmp / "cache.json"
watchdog.DB_PATH = clinic_db.DB_PATH = tmp / "t.db"
os.environ["TINYFISH_API_KEY"] = "fake"
os.environ["GEMINI_API_KEY"] = "fake"
config.MAX_AGENTS = 50
config.GEMINI_RPM = 60000
c = TestClient(m.app, raise_server_exceptions=False).__enter__()
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else extra)
    if not cond:
        fails.append(name)


async def no_geo(*a, **k):  # keep tests offline: no Nominatim calls
    return None
geo.geocode_address = geo.geocode_postal_code = no_geo

# Web pages can't be fetched in tests -> every re-check falls back to the (stubbed) browser agent,
# unless a test puts a page in PAGES.
PAGES, EXTRACTS = {}, {}
async def fake_fetch(url):
    if url not in PAGES:
        raise refresh.PageReadError("blocked in tests")
    return url, PAGES[url]
refresh.fetch_page = fake_fetch
refresh.gemini_read = lambda url, title, text, links: models.PageExtract(**EXTRACTS[url])

STATUS = {"https://open.ca": "accepting", "https://wait.ca": "waitlist", "https://full1.ca": "closed", "https://full2.ca": "closed"}
agent_calls = []
def fake_scan_one(url):
    agent_calls.append(url)
    if url not in STATUS:
        return common.failed_clinic(url, "scan error: blocked")
    return {"name": url.split("//")[1].split(".")[0].title() + " Clinic", "url": url, "status": STATUS[url], "evidence_quote": "q",
            "waitlist_url": None, "raw_notes": "ok", "address": None, "lat": None, "lng": None, "distance_km": None}
scanning.scan_one = fake_scan_one

discover_calls = []
DISCOVERED = list(STATUS) + ["https://boom.ca"]
def fake_discover(req):
    discover_calls.append(req)
    return {"city": req.city, "clinic_urls": DISCOVERED}
discovery.discover = fake_discover

rank_calls = []
def fake_rank(req):
    rank_calls.append(req)
    return {"ranked_clinics": [{"name": x["name"], "url": x["url"], "score": 90 - i, "reason": "r", "requirements": [], "next_step": "n",
                                "coverage_tags": [], "phone_number": None, "call_hours": None, "call_script": None}
                               for i, x in enumerate(req.clinics)]}
ranking.rank = fake_rank


def mission(**body):
    r = c.post("/api/mission/stream", json=body)
    if r.status_code != 200:
        return r.status_code, r.json()
    return 200, [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]


def kinds(ev):
    return [e["type"] for e in ev]


T = "Testville, ON"  # a city with no default clinics

# --- 1. empty database: web search, then every clinic is checked live
code, ev = mission(city=T, user_email="pat@x.ca", preferences=["female doctor"], language="French", coverage_type="UHIP")
types = kinds(ev)
check("200 + done is last and only once", code == 200 and types[-1] == "done" and types.count("done") == 1, str(types))
stages = [e["stage"] for e in ev if e["type"] == "stage"]
check("stages in order (discover -> scan -> rank -> watch)", [s for i, s in enumerate(stages) if i == 0 or s != stages[i - 1]] == ["discover", "scan", "rank", "watch"], str(stages))
check("empty database -> web search for more", len(discover_calls) == 1 and any("searching the web" in e.get("message", "") for e in ev))
check("discovered the 5 found clinics", sorted(ev[types.index("discovered")]["urls"]) == sorted(DISCOVERED), str(ev[types.index("discovered")]))
check("5 clinic_scanned, all re-checked", types.count("clinic_scanned") == 5 and ev[-1]["summary"]["rechecked"] == 5 and ev[-1]["summary"]["from_database"] == 0)
check("live progress messages per clinic", sum(e["type"] == "agent_status" and "Reading" in e["message"] for e in ev) == 5
      and sum(e["type"] == "agent_status" and "Agent started" in e["message"] for e in ev) == 5)
check("rank got language/coverage/preferences + all clinics", rank_calls[-1].language == "French" and rank_calls[-1].coverage_type == "UHIP"
      and rank_calls[-1].preferences == ["female doctor"] and len(rank_calls[-1].clinics) == 5)
w = ev[types.index("watched")]
check("only real closed clinics watched", w["count"] == 2 and sorted(x["url"] for x in w["clinics"]) == ["https://full1.ca", "https://full2.ca"], str(w))
s = ev[-1]["summary"]
check("summary counts", (s["total_scanned"], s["accepting_count"], s["waitlist_count"], s["closed_count"], s["failed_count"], s["watched_count"], s["ranked"])
      == (5, 1, 1, 2, 1, 2, True), str(s))
check("results saved in the database", sum(1 for u in STATUS if (clinic_db.get(u) or {}).get("status")) == 4 and (clinic_db.get("https://boom.ca") or {}).get("status") is None)
check("clinic_scanned has last_checked/checked_via", all("last_checked" in e["clinic"] and "checked_via" in e["clinic"] for e in ev if e["type"] == "clinic_scanned"))

# --- 2. same search again: everything checked recently comes straight from the database
discover_calls.clear(); agent_calls.clear()
code, ev = mission(city=T, max_clinics=4)
types = kinds(ev)
check("fresh clinics: no web search, no agents", discover_calls == [] and agent_calls == [], str(agent_calls))
check("fresh clinics: 4 from the database, instant", types.count("clinic_scanned") == 4 and ev[-1]["summary"]["from_database"] == 4 and ev[-1]["summary"]["rechecked"] == 0)
check("'Up to date (checked ...)' messages", sum(e["type"] == "agent_status" and e["message"].startswith("Up to date (checked") for e in ev) == 4)
check("scan stage says no re-check needed", any(e.get("stage") == "scan" and "no re-check needed" in e["message"] for e in ev), str([e for e in ev if e.get("stage") == "scan"]))

# --- 3. a failed clinic has no saved result, so it's always re-checked
code, ev = mission(city=T, max_clinics=5)
check("max_clinics=5 includes the never-checked clinic, re-checked live", ev[-1]["summary"]["from_database"] == 4 and ev[-1]["summary"]["rechecked"] == 1
      and agent_calls == ["https://boom.ca"], str(ev[-1]["summary"]) + str(agent_calls))

# --- 4. refresh="all" re-checks everything
agent_calls.clear()
code, ev = mission(city=T, max_clinics=5, refresh="all")
check("refresh=all re-checks every clinic", sorted(agent_calls) == sorted(DISCOVERED) and ev[-1]["summary"]["rechecked"] == 5)

# --- 5. max_clinics limits and clamps
code, ev = mission(city=T, max_clinics=2)
check("max_clinics=2 -> 2 clinics", kinds(ev).count("clinic_scanned") == 2 and len(ev[kinds(ev).index("discovered")]["urls"]) == 2)
discover_calls.clear()
code, ev = mission(city=T, max_clinics=500)
check("max_clinics clamped to 25; asks the web for more when short", len(discover_calls) == 1 and discover_calls[0].max_results == 20
      and kinds(ev).count("clinic_scanned") == 5, str(discover_calls))

# --- 6. old results get re-checked in auto mode
with contextlib.closing(clinic_db.connect()) as conn, conn:
    conn.execute("UPDATE clinics SET last_checked='2020-01-01T00:00:00Z' WHERE url_key=?", (clinic_db.url_key("https://open.ca"),))
agent_calls.clear()
code, ev = mission(city=T, max_clinics=4)
check("auto: only the out-of-date clinic is re-checked", agent_calls == ["https://open.ca"], str(agent_calls))

# --- 7. quick page read (no agent) inside a mission
P = "https://fastpage.ca"
filler = " ".join(["Family practice in Testville serving the community."] * 12)
PAGES[P] = f"<html><body><p>{filler}</p><p>Our doctors are accepting new patients.</p></body></html>"
EXTRACTS[P] = {"name": "Fast Page Clinic", "status": "accepting", "evidence_quote": "Our doctors are accepting new patients"}
agent_calls.clear()
code, ev = mission(city=T, clinic_urls=[P])
clin = [e["clinic"] for e in ev if e["type"] == "clinic_scanned"]
check("quick page read used, no agent", agent_calls == [] and clin[0]["status"] == "accepting" and clin[0]["checked_via"] == "page", str(clin))
check("clinic_urls skip discovery", ev[kinds(ev).index("discovered")]["urls"] == [P])

# --- 8. saved results only (demo mode / refresh=none): no key needed, nothing live
os.environ.pop("TINYFISH_API_KEY")
agent_calls.clear(); discover_calls.clear()
code, ev = mission(city=T, use_cache=True, user_email="cache@x.ca")
types = kinds(ev)
check("demo mode: database results, no TinyFish key needed", code == 200 and types.count("clinic_scanned") >= 5 and agent_calls == [] and discover_calls == [], str(ev)[:300])
check("demo mode: still ranks + watches", "ranked" in types and ev[types.index("watched")]["count"] == 2)
code, ev = mission(city=T, refresh="none")
check("refresh=none behaves like demo mode", code == 200 and agent_calls == [] and kinds(ev)[-1] == "done")
code, j = mission(city=T)
check("live mode without key -> JSON 500 before stream", code == 500 and "TINYFISH_API_KEY" in j["detail"], str(j))
os.environ["TINYFISH_API_KEY"] = "fake"

# --- 9. demo mode with nothing saved for the city -> the demo cache file
cached = [fake_scan_one(u) for u in ["https://open.ca", "https://full1.ca"]]
config.CACHE_PATH.write_text(json.dumps({"clinics": cached}), encoding="utf-8")
code, ev = mission(city="Emptytown, ON", use_cache=True)
check("demo mode, empty city -> demo cache", code == 200 and kinds(ev).count("clinic_scanned") == 2
      and any("Demo mode" in e.get("message", "") for e in ev), str(ev)[:300])

# --- 10. failures never stop the mission
def broken_discover(req): raise RuntimeError("search down")
discovery.discover = broken_discover
code, ev = mission(city="London, ON", max_clinics=5)
types = kinds(ev)
check("web search error -> error event, London defaults, still done", "error" in types and types[-1] == "done"
      and set(ev[types.index("discovered")]["urls"]) <= set(config.DEFAULT_CLINIC_URLS) and len(ev[types.index("discovered")]["urls"]) == 5, str(types))
code, ev = mission(city="Nowhere, ON")
types = kinds(ev)
check("nothing found anywhere -> empty, rank error, done", ev[types.index("discovered")]["urls"] == [] and types[-1] == "done"
      and any(e.get("stage") == "rank" and e["type"] == "error" for e in ev) and ev[-1]["summary"]["total_scanned"] == 0, str(ev))
discovery.discover = fake_discover
def broken_rank(req): raise HTTPException(status_code=502, detail="rank failed: gemini down")
ranking.rank = broken_rank
code, ev = mission(city=T, user_email="pat@x.ca")
types = kinds(ev)
check("rank error -> error event, watch still runs, done", "ranked" not in types and "watched" in types and types[-1] == "done"
      and any(e["type"] == "error" and "gemini down" in e["message"] for e in ev) and ev[-1]["summary"]["ranked"] is False, str(types))
ranking.rank = fake_rank
check("re-running never duplicates watches", len(watchdog.list_watches("pat@x.ca")) == 2)

# --- 11. validation
check("bad email -> 422", mission(user_email="nope")[0] == 422)
check("too many urls -> 422", mission(clinic_urls=[f"https://x{i}.ca" for i in range(21)])[0] == 422)
check("oversize preferences -> 422", mission(preferences=["x"] * 21)[0] == 422)
check("unknown refresh value treated as auto", mission(city=T, refresh="banana")[0] == 200)

paths = sorted(c.get("/openapi.json").json()["paths"])
for p in ["/api/discover", "/api/scan", "/api/scan/stream", "/api/rank", "/api/apply", "/api/watch", "/api/verify-doctor", "/api/mission/stream", "/api/clinics"]:
    check("route exists " + p, p in paths)
check("real fallback_cache.json untouched", REAL_CACHE.read_bytes() == real_before)
print("\nALL PASSED" if not fails else "\nFAILED: " + str(fails))
