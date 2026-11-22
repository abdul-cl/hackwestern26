"""Clinic database + quick re-checks (refresh.py) + /api/clinics endpoints. No network, no credits."""
import asyncio, json, os, sys, tempfile, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as NS

BACKEND = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, BACKEND)
import os as _os, tempfile as _tempfile
_os.environ.setdefault("DATA_DIR", _tempfile.mkdtemp())  # never touch the real clinics.db
_os.environ.setdefault("CARESCOUT_SEED", "0")  # tests start with an empty clinic database
_os.environ.setdefault("DEMO_REPLAY", "0")  # never replay the real demo recording in tests
import app.main as m
from app import config, clinic_db, refresh, scanning, discovery, watchdog, geo, models
from fastapi.testclient import TestClient

tmp = Path(tempfile.mkdtemp())
REAL_CACHE = config.CACHE_PATH
real_before = REAL_CACHE.read_bytes()
config.CACHE_PATH = tmp / "cache.json"
clinic_db.DB_PATH = watchdog.DB_PATH = tmp / "t.db"
os.environ["TINYFISH_API_KEY"] = "fake"
os.environ["GEMINI_API_KEY"] = "fake"
config.MAX_AGENTS = 50
config.GEMINI_RPM = 60000  # no spacing in tests
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else extra)
    if not cond:
        fails.append(name)


async def no_geo(*a, **k):
    return None
geo.geocode_address = geo.geocode_postal_code = no_geo

# ---------- stubs: pages, Gemini, agent ----------
PAGES = {}  # url -> html
fetches, gemini_calls, agent_calls = [], [], []


async def fake_fetch(url):
    fetches.append(url)
    if url not in PAGES:
        raise refresh.PageReadError("the site answered HTTP 403")
    return url, PAGES[url]
refresh.fetch_page = fake_fetch

EXTRACTS = {}  # url -> PageExtract kwargs


def fake_gemini(url, title, text, links):
    gemini_calls.append(url)
    return models.PageExtract(**EXTRACTS.get(url, {"status": "unknown"}))
refresh.gemini_read = fake_gemini

AGENT = {}  # url -> status (missing = agent fails)


def fake_scan_one(url):
    agent_calls.append(url)
    if url not in AGENT:
        return {**__import__("app.common", fromlist=["x"]).failed_clinic(url, "scan failed: blocked")}
    return {"name": f"Agent {url}", "url": url, "status": AGENT[url], "evidence_quote": "agent quote", "waitlist_url": None,
            "raw_notes": "from agent", "address": None, "lat": None, "lng": None, "distance_km": None}
scanning.scan_one = fake_scan_one


def page(body, links=""):
    filler = " ".join(["Our family practice serves patients across London Ontario."] * 12)
    return f"<html><head><title>Clinic</title><script>var x = 'not accepting';</script></head><body><p>{filler}</p><p>{body}</p>{links}</body></html>"


def run(coro):
    return asyncio.run(coro)


def reset():
    fetches.clear(); gemini_calls.clear(); agent_calls.clear()


# ---------- keys / normalisation ----------
check("url_key ignores www, scheme and trailing slash", clinic_db.url_key("https://www.A.ca/page/") == clinic_db.url_key("http://a.ca/page") == "a.ca/page")
check("city_key", clinic_db.city_key("London, ON") == clinic_db.city_key(" london") == "london")
check("add_url new then duplicate", clinic_db.add_url("https://a.ca/page", "London, ON") is True and clinic_db.add_url("https://www.a.ca/page/", "London") is False)
check("unchecked clinic has no status", clinic_db.get("https://a.ca/page")["status"] is None)

# ---------- save / failures / freshness ----------
c1 = {"name": "A Clinic", "url": "https://a.ca/page", "status": "closed", "evidence_quote": "We are full.", "waitlist_url": None,
      "raw_notes": "n", "address": "1 Main St, London, ON", "lat": 43.0, "lng": -81.2}
row, old = clinic_db.save_check("https://a.ca/page", "London, ON", c1, "h1", "page")
check("save_check stores result", row["status"] == "closed" and old is None and row["checked_via"] == "page" and row["last_checked"])
row, old = clinic_db.save_check("https://a.ca/page", "London, ON", {**c1, "status": "accepting", "lat": None, "lng": None}, "h2", "page")
check("status change: old status returned, last_changed set, coords kept (same address)",
      old == "closed" and row["status"] == "accepting" and row["last_changed"] and row["lat"] == 43.0, str(row))
row, _ = clinic_db.save_check("https://a.ca/page", "London, ON", {**c1, "address": "9 New Rd, London, ON", "lat": None, "lng": None}, "h3", "page")
check("new address clears old coordinates", row["lat"] is None)
row = clinic_db.mark_failed("https://a.ca/page", "boom")
check("failure keeps last good result", row["status"] == "closed" and row["fail_count"] == 1 and row["last_error"] == "boom")
check("fresh right after a check", clinic_db.is_fresh(clinic_db.get("https://a.ca/page"), 12))
check("unchecked is never fresh", not clinic_db.is_fresh({"status": None, "last_checked": None}, 12))
to = clinic_db.to_clinic(clinic_db.get("https://a.ca/page"))
check("to_clinic has API shape + last_checked/checked_via", set(to) == {"name", "url", "status", "evidence_quote", "waitlist_url", "raw_notes",
      "address", "lat", "lng", "distance_km", "last_checked", "checked_via", "expired", "status_age_days"}, str(to))

# ---------- nearby ----------
for i, (lat, status) in enumerate([(43.10, "accepting"), (43.01, "closed"), (None, "waitlist")]):
    clinic_db.add_url(f"https://n{i}.ca", "Testville, ON")
    clinic_db.save_check(f"https://n{i}.ca", "Testville, ON", {**c1, "url": f"https://n{i}.ca", "name": f"N{i}", "status": status,
                         "address": f"{i} St", "lat": lat, "lng": -81.2 if lat else None}, "h", "page")
clinic_db.add_url("https://unchecked.ca", "Testville")
near = clinic_db.nearby("Testville, ON", {"lat": 43.0, "lng": -81.2}, 10)
check("nearby: closest first, no-location last", [r["url"] for r in near][:3] == ["https://n1.ca", "https://n0.ca", "https://n2.ca"], str([r["url"] for r in near]))
check("nearby: unchecked only when asked", len(clinic_db.nearby("Testville", None, 10, include_unchecked=False)) == 3 and len(near) == 4)
check("nearby without location: accepting first", clinic_db.nearby("Testville", None, 1, include_unchecked=False)[0]["status"] == "accepting")
check("nearby: other cities excluded", all(r["city_key"] == "testville" for r in near))

# ---------- stale ----------
old_time = (datetime.now(timezone.utc) - timedelta(hours=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
import contextlib, sqlite3
with contextlib.closing(clinic_db.connect()) as conn, conn:
    conn.execute("UPDATE clinics SET last_checked=? WHERE url_key=?", (old_time, clinic_db.url_key("https://n0.ca")))
st = [r["url"] for r in clinic_db.stale(10, 12)]
check("stale: never-checked first, then oldest", st[0] in ("https://unchecked.ca",) and "https://n0.ca" in st and "https://n1.ca" not in st, str(st))

# ---------- html reading ----------
html = '<html><head><title> My  Clinic </title><style>.x{}</style></head><body><nav><a href="/new-patients">New Patients</a><a href="mailto:x@y">mail</a></nav>' \
       '<p>We are accepting new patients.</p><script>bad()</script><a href="https://other.ca/form#top">Join waitlist</a></body></html>'
text, links, title = refresh.read_html(html, "https://clinic.ca/home")
check("read_html: visible text only", "accepting new patients" in text and "bad()" not in text and ".x{}" not in text, text)
check("read_html: links resolved, mailto dropped, fragment stripped",
      [l["url"] for l in links] == ["https://clinic.ca/new-patients", "https://other.ca/form"], str(links))
check("read_html: title", title == "My Clinic")
check("relevant_links", [l["text"] for l in refresh.relevant_links(links)] == ["New Patients", "Join waitlist"])
long_text = ("filler words " * 2000) + " We are not accepting new patients at this time. " + ("more filler " * 2000)
f = refresh.focus(long_text)
check("focus: long page trimmed but keeps the availability sentence", len(f) < 13000 and "not accepting new patients" in f)
check("quote_in_text: loose match", refresh.quote_in_text("We are NOT accepting new patients!", "...we are not accepting  new patients at this time"))
check("quote_in_text: invented quote rejected", not refresh.quote_in_text("Accepting all patients today", long_text))
check("page_hash ignores spacing/case", refresh.page_hash("Hello  World") == refresh.page_hash("hello world"))

# ---------- check_url: quick page read ----------
U = "https://fast.ca"
PAGES[U] = page("Good news: we are accepting new patients for Dr. Lee.")
EXTRACTS[U] = {"name": "Fast Clinic", "status": "accepting", "evidence_quote": "we are accepting new patients for Dr. Lee",
               "address": "5 King St, London, ON", "raw_notes": "Call 519-555-0100", "waitlist_url": "/apply"}
reset()
r = run(refresh.check_url(U, "London, ON"))
check("quick read: method page, no agent", r["method"] == "page" and agent_calls == [] and gemini_calls == [U], str(r))
check("quick read: clinic stored", clinic_db.get(U)["status"] == "accepting" and clinic_db.get(U)["checked_via"] == "page")
check("quick read: relative waitlist link resolved", r["clinic"]["waitlist_url"] == "https://fast.ca/apply", str(r["clinic"]))
reset()
r = run(refresh.check_url(U, "London, ON"))
check("same page again: unchanged, Gemini not called", r["method"] == "unchanged" and gemini_calls == [] and fetches == [U], str(r))
reset()
r = run(refresh.check_url(U, "London, ON", force=True))
check("force re-reads even if unchanged", r["method"] == "page" and gemini_calls == [U])
PAGES[U] = page("Update: we are no longer accepting new patients.")
EXTRACTS[U] = {"name": "Fast Clinic", "status": "closed", "evidence_quote": "we are no longer accepting new patients"}
reset()
r = run(refresh.check_url(U, "London, ON"))
check("changed page: re-read, status updated", r["method"] == "page" and r["clinic"]["status"] == "closed" and r["status_changed"], str(r))

# invented evidence -> not trusted -> agent fallback
U2 = "https://liar.ca"
PAGES[U2] = page("Welcome to our clinic.")
EXTRACTS[U2] = {"name": "Liar", "status": "accepting", "evidence_quote": "We are accepting thousands of new patients"}
AGENT[U2] = "waitlist"
reset()
r = run(refresh.check_url(U2, "London, ON"))
check("evidence not on the page -> agent fallback", r["method"] == "agent" and agent_calls == [U2] and r["clinic"]["status"] == "waitlist", str(r))

# better_url follow
U3 = "https://deep.ca"
PAGES[U3] = page("Welcome.", '<a href="/become-a-patient">Become a patient</a>')
EXTRACTS[U3] = {"name": "Deep Clinic", "status": "unknown", "better_url": "/become-a-patient", "address": "7 Elm St"}
PAGES["https://deep.ca/become-a-patient"] = page("Join our waitlist using the form below.")
EXTRACTS["https://deep.ca/become-a-patient"] = {"name": "", "status": "waitlist", "evidence_quote": "Join our waitlist using the form below"}
reset()
r = run(refresh.check_url(U3, "London, ON"))
check("follows the new-patient link when the page doesn't say", r["method"] == "page" and r["clinic"]["status"] == "waitlist"
      and fetches == [U3, "https://deep.ca/become-a-patient"] and r["clinic"]["name"] == "Deep Clinic" and r["clinic"]["address"] == "7 Elm St", str(r))
check("stored under the original url", clinic_db.get(U3)["status"] == "waitlist")

# better_url must be one of the page's links
U4 = "https://sneaky.ca"
PAGES[U4] = page("Welcome.")
EXTRACTS[U4] = {"status": "unknown", "better_url": "https://evil.example/phish"}
reset()
r = run(refresh.check_url(U4, "London, ON", allow_agent=False))
check("better_url not on the page is ignored", "https://evil.example/phish" not in fetches and r["method"] == "failed", str(fetches))

# fetch blocked -> agent; agent fails -> keep old result
U5 = "https://blocked.ca"
AGENT[U5] = "accepting"
reset()
r = run(refresh.check_url(U5, "London, ON"))
check("blocked site -> agent", r["method"] == "agent" and r["clinic"]["status"] == "accepting" and clinic_db.get(U5)["checked_via"] == "agent")
del AGENT[U5]
reset()
r = run(refresh.check_url(U5, "London, ON"))
check("agent fails too -> last good result kept", r["method"] == "failed" and r["clinic"]["status"] == "accepting" and r["error"], str(r))
reset()
r = run(refresh.check_url("https://nothing.ca", "London, ON"))
check("never-checked + all fails -> failed clinic shape", r["method"] == "failed" and r["clinic"]["raw_notes"].startswith("scan failed"), str(r))
reset()
r = run(refresh.check_url("https://short.ca", "London, ON", allow_agent=False))
check("allow_agent=False never starts an agent", agent_calls == [] and r["method"] == "failed")
PAGES["https://tiny.ca"] = "<html><body><div id=root></div></body></html>"
AGENT["https://tiny.ca"] = "closed"
reset()
r = run(refresh.check_url("https://tiny.ca", "London, ON"))
check("JavaScript-only page (no text) -> agent", r["method"] == "agent" and gemini_calls == [], str(r))
reset()
r = run(refresh.check_url("not a url", "London, ON"))
check("invalid url -> failed, nothing fetched", r["method"] == "failed" and fetches == [] and agent_calls == [])

def gemini_boom(*a):
    raise RuntimeError("429 RESOURCE_EXHAUSTED")
refresh.gemini_read = gemini_boom
PAGES["https://quota.ca"] = page("We are accepting new patients.")
AGENT["https://quota.ca"] = "accepting"
reset()
r = run(refresh.check_url("https://quota.ca", "London, ON"))
check("Gemini error -> agent fallback", r["method"] == "agent", str(r))
refresh.gemini_read = fake_gemini

# ---------- watchdog alerts on change ----------
W = "https://watched.ca"
watchdog.add_watch("Watched Clinic", W, "closed", "pat@x.ca")
clinic_db.save_check(W, "London, ON", {**c1, "url": W, "name": "Watched Clinic", "status": "closed"}, "old", "page")
PAGES[W] = page("We are now accepting new patients!")
EXTRACTS[W] = {"name": "Watched Clinic", "status": "accepting", "evidence_quote": "We are now accepting new patients"}
r = run(refresh.check_url(W, "London, ON"))
alerts = watchdog.list_alerts("pat@x.ca")
check("status change alerts watchers", r["status_changed"] and len(alerts) == 1 and alerts[0]["new_status"] == "accepting"
      and "Good news" in alerts[0]["message"] and watchdog.list_watches("pat@x.ca")[0]["last_status"] == "accepting", str(alerts))
r = run(refresh.check_url(W, "London, ON"))
check("no change -> no new alert", len(watchdog.list_alerts("pat@x.ca")) == 1)

# ---------- refresh_stale + loop ----------
with contextlib.closing(clinic_db.connect()) as conn, conn:
    conn.execute("UPDATE clinics SET last_checked=?", (old_time,))
reset()
tally = run(refresh.refresh_stale(limit=3, hours=12, allow_agent=False))
check("refresh_stale: tally + no agent when not allowed", tally["checked"] == 3 and agent_calls == [] and sum(tally[k] for k in ("unchanged", "page", "agent", "failed")) == 3, str(tally))
check("refresh_stale records last_refresh", clinic_db.stats(12)["last_refresh"])
runs = []
async def fake_stale():
    runs.append(1)
    if len(runs) == 2:
        raise RuntimeError("bad run")
    return {}
real_stale, refresh.refresh_stale = refresh.refresh_stale, fake_stale
config.REFRESH_INTERVAL_MIN = 0.001
async def loop_briefly():
    try:
        await asyncio.wait_for(refresh.refresher_loop(), timeout=0.5)
    except asyncio.TimeoutError:
        pass
run(loop_briefly())
check("refresher loop keeps running after an error", len(runs) >= 3, str(runs))
refresh.refresh_stale = real_stale


# ---------- endpoints ----------
clinic_db.DB_PATH = tmp / "api.db"
c = TestClient(m.app, raise_server_exceptions=False).__enter__()
clinic_db.save_check("https://near.ca", "London, ON", {**c1, "url": "https://near.ca", "name": "Near", "status": "accepting", "address": "x", "lat": 43.0, "lng": -81.2}, "h", "page")
clinic_db.save_check("https://far.ca", "London, ON", {**c1, "url": "https://far.ca", "name": "Far", "status": "closed", "address": "y", "lat": 43.5, "lng": -81.2}, "h", "page")
clinic_db.add_url("https://new.ca", "London, ON")
async def fake_user_loc(code):
    return {"lat": 43.0, "lng": -81.2} if code else None
scanning.user_location = fake_user_loc
j = c.get("/api/clinics", params={"city": "London, ON", "postal_code": "N6A 3K7"}).json()
check("GET /api/clinics: checked only, closest first, distances", [x["name"] for x in j["clinics"]] == ["Near", "Far"]
      and j["clinics"][0]["distance_km"] == 0.0 and j["clinics"][1]["distance_km"] > 50, str(j)[:300])
check("GET /api/clinics: stats", j["stats"]["total"] == 3 and j["stats"]["checked"] == 2 and j["stats"]["by_status"]["accepting"] == 1)
j = c.get("/api/clinics", params={"city": "London", "include_unchecked": "true"}).json()
check("GET /api/clinics include_unchecked", len(j["clinics"]) == 3 and any(x["raw_notes"] == "scan failed: not checked yet" for x in j["clinics"]))
check("GET /api/clinics/stats", c.get("/api/clinics/stats").json()["total"] == 3)
PAGES["https://near.ca"] = page("Sorry, our practice is full.")
EXTRACTS["https://near.ca"] = {"name": "Near", "status": "closed", "evidence_quote": "our practice is full"}
r = c.post("/api/clinics/refresh", json={"url": "https://near.ca"})
check("POST /api/clinics/refresh re-reads now", r.status_code == 200 and r.json()["method"] == "page" and r.json()["clinic"]["status"] == "closed", r.text)
check("refresh: bad url -> 422", c.post("/api/clinics/refresh", json={"url": "nope"}).status_code == 422)
discovery.discover = lambda req: {"city": req.city, "clinic_urls": ["https://near.ca", "https://brand-new.ca"]}
AGENT["https://brand-new.ca"] = "waitlist"
r = c.post("/api/clinics/seed", json={"city": "London, ON", "max_new": 5})
check("POST /api/clinics/seed adds only new clinics", r.status_code == 200 and r.json()["added"] == ["https://brand-new.ca"], r.text)
for _ in range(50):
    if (clinic_db.get("https://brand-new.ca") or {}).get("status"):
        break
    time.sleep(0.1)
check("seed: new clinic checked in the background", clinic_db.get("https://brand-new.ca")["status"] == "waitlist")

config.PUBLIC_DEMO = True
m._hits.clear()
check("public: GET /api/clinics allowed", c.get("/api/clinics").status_code == 200)
check("public: refresh blocked", c.post("/api/clinics/refresh", json={"url": "https://near.ca"}).status_code == 403)
check("public: seed blocked", c.post("/api/clinics/seed", json={}).status_code == 403)
config.PUBLIC_DEMO = False

check("real fallback_cache.json untouched", REAL_CACHE.read_bytes() == real_before)
print("\nALL PASSED" if not fails else "\nFAILED: " + str(fails))
