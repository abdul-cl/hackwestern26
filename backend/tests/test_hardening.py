"""Judge-review fixes: browser-agent answers need evidence, no fetching internal addresses, one check per clinic at a
time, background re-checks stay out of a patient's way, directories aren't clinics. No network, no credits."""
import asyncio, os, sys, tempfile
from pathlib import Path
from types import SimpleNamespace as NS

BACKEND = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, BACKEND)
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp())  # never touch the real clinics.db
os.environ.setdefault("CARESCOUT_SEED", "0")
os.environ.setdefault("DEMO_REPLAY", "0")  # never replay the real demo recording in tests
from app import config, common, agents, clinic_db, refresh, scanning, watchdog

tmp = Path(tempfile.mkdtemp())
clinic_db.DB_PATH = watchdog.DB_PATH = tmp / "t.db"
os.environ["TINYFISH_API_KEY"] = os.environ["GEMINI_API_KEY"] = "fake"
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else extra)
    if not cond:
        fails.append(name)


# ---- browser agent answers: a status needs a real answer and a quote
def agent_returns(result, status="COMPLETED"):
    run = NS(status=status, result=result, error=None)
    config.tinyfish_client = lambda timeout: NS(agent=NS(run=lambda **kw: run))


agent_returns({"name": "A", "status": "Accepting", "evidence_quote": "We are accepting new patients.", "raw_notes": "call"})
c = scanning.scan_one("https://a.ca")
check("agent: good answer kept (status normalised)", c["status"] == "accepting" and not common.is_failed(c), str(c))
agent_returns({"name": "A", "status": "maybe", "evidence_quote": "Hours: 9-5"})
c = scanning.scan_one("https://a.ca")
check("agent: unclear status is 'couldn't check', never 'closed'", common.is_failed(c) and "couldn't tell" in c["raw_notes"], str(c))
agent_returns({"name": "A", "status": "closed", "evidence_quote": ""})
c = scanning.scan_one("https://a.ca")
check("agent: a status without a quote from the page is not trusted", common.is_failed(c) and "no quote" in c["raw_notes"], str(c))
agent_returns({"name": "A"})
check("agent: missing status is a failed scan", common.is_failed(scanning.scan_one("https://a.ca")))

# ---- directories are never clinics
check("directory urls recognised", common.is_directory_url("https://www.ldam.ca/find-a-doctor") and common.is_directory_url("https://x.ca/Find-A-Doctor/")
      and not common.is_directory_url("https://thamesvalleyfht.ca/become-a-patient/"))
check("directory never added to the clinic database", clinic_db.add_url("https://www.ldam.ca/find-a-doctor", "London, ON") is False)
check("defaults contain no directory", not any(common.is_directory_url(u) for u in config.DEFAULT_CLINIC_URLS))


# ---- one entry per clinic website (a homepage + a new-patient page must not show as two clinics)
D = "Dedupe, ON"
check("site: first page of a clinic is added", clinic_db.add_url("https://www.lfht.ca/apply-here-now/", D) is True)
check("site: another page of the same website is not added", clinic_db.add_url("https://lfht.ca/our-locations", D) is False)
check("site: same website in another city is separate", clinic_db.add_url("https://lfht.ca/our-locations", "Other, ON") is True)
clinic_db.add_url("https://tv.ca/", D)
with __import__("contextlib").closing(clinic_db.connect()) as conn, conn:  # an older database that already has two pages of one site
    conn.execute("INSERT INTO clinics (url_key, url, city, city_key, source, created_at) VALUES ('tv.ca/become-a-patient', 'https://tv.ca/become-a-patient/', ?, ?, 'seed', '2026-01-01T00:00:00Z')", (D, clinic_db.city_key(D)))
good = {"name": "TV", "status": "accepting", "evidence_quote": "We are accepting new patients", "waitlist_url": None, "raw_notes": "",
        "address": None, "lat": None, "lng": None}
clinic_db.save_check("https://tv.ca/", D, {**good, "url": "https://tv.ca/", "status": "closed"}, None, "page")
clinic_db.save_check("https://tv.ca/become-a-patient/", D, {**good, "url": "https://tv.ca/become-a-patient/"}, None, "page")
urls = [r["url"] for r in clinic_db.nearby(D, None, 10)]
check("site: searches show one entry per website, preferring the new-patient page", urls.count("https://tv.ca/become-a-patient/") == 1
      and "https://tv.ca/" not in urls and len([u for u in urls if "lfht" in u]) == 1, str(urls))

# ---- no fetching internal addresses (SSRF)
async def refused(url):
    try:
        await refresh.check_public_host(url)
        return False
    except refresh.PageReadError:
        return True


for bad in ["http://127.0.0.1/", "http://localhost:8000/health", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/",
            "http://192.168.1.1/", "http://[::1]/", "http://0.0.0.0/", "ftp://8.8.8.8/"]:
    check(f"internal address refused: {bad}", asyncio.run(refused(bad)))
check("public address allowed", not asyncio.run(refused("https://8.8.8.8/")))


async def fetch_internal():
    try:
        await refresh.fetch_page("http://127.0.0.1:9/")
        return "fetched"
    except refresh.PageReadError as e:
        return str(e)


check("fetch_page refuses before connecting", "public website" in asyncio.run(fetch_internal()))

# ---- one check per clinic at a time
running = {"now": 0, "max": 0, "calls": 0}
real_check = refresh._check_url


async def slow_check(url, city, **kw):
    running["now"] += 1
    running["calls"] += 1
    running["max"] = max(running["max"], running["now"])
    await asyncio.sleep(0.05)
    running["now"] -= 1
    return {"clinic": {"url": url}, "method": "unchanged", "status_changed": False, "error": None}


refresh._check_url = slow_check
real_check_url, real_refresh_stale = refresh.check_url, refresh.refresh_stale


async def same_and_different():
    await asyncio.gather(*(refresh.check_url("https://same.ca", "London, ON") for _ in range(3)))
    same_max = running["max"]
    running["max"] = 0
    await asyncio.gather(refresh.check_url("https://one.ca", "London, ON"), refresh.check_url("https://two.ca", "London, ON"))
    return same_max, running["max"]


same_max, diff_max = asyncio.run(same_and_different())
check("same clinic: checks run one at a time", same_max == 1 and running["calls"] == 5, str(running))
check("different clinics: still in parallel", diff_max == 2, str(diff_max))

# ---- background re-checks: one at a time, no browser agents while a search runs
seen = []


async def record(url, city, *, allow_agent=True, **kw):
    seen.append((url, allow_agent, running["now"]))
    running["now"] += 1
    await asyncio.sleep(0.01)
    running["now"] -= 1
    return {"clinic": {"url": url}, "method": "unchanged", "status_changed": False, "error": None}


refresh.check_url = record
for u in ("https://r1.ca", "https://r2.ca", "https://r3.ca"):
    clinic_db.add_url(u, "London, ON")
config.REFRESH_ALLOW_AGENT = True
asyncio.run(refresh.refresh_stale(limit=3, hours=1))
check("background batch: one clinic at a time", len(seen) == 3 and all(n == 0 for _, _, n in seen), str(seen))
check("background batch: agents allowed when nobody is searching", all(a for _, a, _ in seen), str(seen))
seen.clear()
agents.search_started()
asyncio.run(refresh.refresh_stale(limit=3, hours=1))
agents.search_finished()
check("background batch: no browser agents while a search runs", len(seen) == 3 and not any(a for _, a, _ in seen), str(seen))
check("search counter back to zero", not agents.searches_running())

runs = []


async def fake_stale():
    runs.append(1)
    return {}


refresh.refresh_stale = fake_stale
config.REFRESH_INTERVAL_MIN = 1  # 60 s


async def start_loop():
    try:
        await asyncio.wait_for(refresh.refresher_loop(), timeout=0.3)
    except asyncio.TimeoutError:
        pass


asyncio.run(start_loop())
check("background job waits before its first batch (a restart before a demo starts nothing)", runs == [], str(runs))

# ---- demo replay of a recorded real search
import json
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
import app.main as m
from app import geo, ranking

refresh.check_url = real_check_url
refresh.refresh_stale = real_refresh_stale
refresh._check_url = real_check


async def no_geo(*a, **k):
    return None


geo.geocode_address = geo.geocode_postal_code = geo.geocode_clinic = no_geo
ranked_with = []
ranking.rank = lambda req: (ranked_with.append(req), {"ranked_clinics": [{"name": "Rec Clinic", "url": "https://rec.ca", "score": 90, "reason": "r",
                                                                         "requirements": [], "next_step": "n", "coverage_tags": [], "phone_number": None,
                                                                         "call_hours": None, "call_script": None}]})[1]
now = datetime.now(timezone.utc)
iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
rec_clinic = {"name": "Rec Clinic", "url": "https://rec.ca", "status": "closed", "evidence_quote": "We are not accepting new patients.",
              "waitlist_url": None, "raw_notes": "", "address": None, "lat": 43.0, "lng": -81.2, "distance_km": 99.0,
              "last_checked": iso(now - timedelta(hours=2)), "checked_via": "page"}
old_clinic = {**rec_clinic, "name": "Old Clinic", "url": "https://old.ca", "status": "accepting", "last_checked": iso(now - timedelta(days=30))}
recording = {"recorded_at": iso(now - timedelta(hours=2)), "city": "London, ON", "events": [
    {"t": 0.0, "event": {"type": "stage", "stage": "discover", "message": "Scout Agent looking for clinics in London, ON..."}},
    {"t": 0.5, "event": {"type": "discovered", "urls": ["https://rec.ca", "https://old.ca"]}},
    {"t": 1.0, "event": {"type": "agent_status", "url": "https://rec.ca", "message": "Reading the clinic's website..."}},
    {"t": 30.0, "event": {"type": "agent_status", "url": "https://rec.ca", "message": "Agent started scanning..."}},
    {"t": 90.0, "event": {"type": "clinic_scanned", "clinic": rec_clinic}},
    {"t": 91.0, "event": {"type": "clinic_scanned", "clinic": old_clinic}},
    {"t": 92.0, "event": {"type": "ranked", "ranked_clinics": []}},
]}
config.DEMO_REPLAY_PATH = tmp / "demo_mission.json"
config.DEMO_REPLAY_PATH.write_text(json.dumps(recording), encoding="utf-8")
config.DEMO_REPLAY, config.REPLAY_SPEED, config.REPLAY_MAX_GAP_S = True, 1000, 0.05
config.CACHE_PATH = tmp / "cache.json"  # saved demo results for other cities (so nothing here goes live)
config.CACHE_PATH.write_text(json.dumps({"clinics": [{**rec_clinic, "url": "https://cached.ca", "name": "Cached"}]}), encoding="utf-8")
config.PUBLIC_DEMO = False
client = TestClient(m.app)


def mission(body):
    r = client.post("/api/mission/stream", json=body)
    import json as _j
    return r.status_code, [_j.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]


t0 = m.time.monotonic()
code, ev = mission({"use_cache": True, "user_email": config.DEMO_EMAIL})
took = m.time.monotonic() - t0
types = [e["type"] for e in ev]
check("replay: demo search plays the recording first", code == 200 and types[0] == "replay" and "agent_status" in types, str(types))
check("replay: sped up (90 s of real work in well under a second here)", took < 3, str(took))
scanned = [e["clinic"] for e in ev if e["type"] == "clinic_scanned"]
check("replay: recorded clinics come through, ranked live", [c["url"] for c in scanned] == ["https://rec.ca", "https://old.ca"]
      and len(ranked_with) == 1 and any(e["type"] == "ranked" and e["ranked_clinics"] for e in ev), str(types))
check("replay: the recording's own 'ranked' event is not replayed", sum(t == "ranked" for t in types) == 1)
check("replay: per-visitor distance never reused from the recording", scanned[0]["distance_km"] is None)
check("replay: old recorded results show as expired, not current", scanned[1]["expired"] is True and scanned[0]["expired"] is False, str(scanned))
check("replay: the demo account auto-watches the recorded closed clinic", any(e["type"] == "watched" and e["count"] == 1 for e in ev))
done = ev[-1]
check("replay: summary says it's a replay", done["type"] == "done" and done["summary"]["replay_recorded_at"] == recording["recorded_at"], str(done))
code, ev = mission({"use_cache": True, "city": "Toronto, ON"})
check("replay: only for the recorded city", "replay" not in [e["type"] for e in ev])
code, ev = mission({"use_cache": True, "refresh": "none"})
check("replay: refresh 'none' means database only, no replay", "replay" not in [e["type"] for e in ev])
config.DEMO_REPLAY_PATH.write_text("{broken", encoding="utf-8")
from app import orchestrator
check("replay: a broken recording is ignored", orchestrator.load_replay("London, ON") is None)
code, ev = mission({"use_cache": True})
check("replay: with a broken recording, demo search still works from saved results", code == 200 and "replay" not in [e["type"] for e in ev]
      and ev[-1]["type"] == "done", str(ev)[-300:])

print("\nALL PASSED" if not fails else "\nFAILED: " + str(fails))
sys.exit(1 if fails else 0)
