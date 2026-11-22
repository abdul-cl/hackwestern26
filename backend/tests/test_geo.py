import asyncio, json, os, sys, tempfile, time
from pathlib import Path

BACKEND = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, BACKEND)
import os as _os, tempfile as _tempfile
_os.environ.setdefault("DATA_DIR", _tempfile.mkdtemp())  # never touch the real clinics.db
_os.environ.setdefault("CARESCOUT_SEED", "0")  # tests start with an empty clinic database
_os.environ.setdefault("DEMO_REPLAY", "0")  # never replay the real demo recording in tests
import app.main as m
from app import config, common, models, cache, agents, geo, watchdog, scanning, discovery, ranking, apply_form, cpso, orchestrator, watch_api
import app.geo as geo
REAL_GEOCODE_ADDRESS, REAL_GEOCODE_POSTAL = geo.geocode_address, geo.geocode_postal_code
from fastapi.testclient import TestClient

tmp = Path(tempfile.mkdtemp())
REAL_CACHE = config.CACHE_PATH
real_before = REAL_CACHE.read_bytes()
config.CACHE_PATH = tmp / "cache.json"
watchdog.DB_PATH = tmp / "t.db"
os.environ["TINYFISH_API_KEY"] = "fake"
config.MAX_AGENTS = 50  # no agent limit unless a test sets one
c = TestClient(m.app, raise_server_exceptions=False).__enter__()  # one event loop, like uvicorn
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else extra)
    if not cond:
        fails.append(name)


# --- pure helpers
check("postal normalize", [geo.normalize_postal_code(x) for x in ["n6a3k7", "N6A 3K7", " n6a-3k7 ", "N6A", "12345", None]]
      == ["N6A 3K7", "N6A 3K7", "N6A 3K7", None, None, None])
d = geo.haversine_km(42.9849, -81.2453, 43.6532, -79.3832)  # London -> Toronto
check("haversine London->Toronto ~169km", 165 < d < 175, str(d))
check("haversine zero", geo.haversine_km(43, -81, 43, -81) == 0)

# --- address clean-up used for geocoding fallbacks
for a, want in {
    "122-747 Hyde Park Road, London, ON N6H 3S3": "747 Hyde Park Road, London, ON N6H 3S3",
    "155 Clarke Road Unit 5 London, ON N5W 5C9": "155 Clarke Road London, ON N5W 5C9",
    "1261 Beaverbrook Ave – Unit 1, London, ON N6H 0G6": "1261 Beaverbrook Ave London, ON N6H 0G6",
    "100 King St, Suite 200, London ON": "100 King St London ON",
    "1051 Wonderland Road South, London, Ontario N6K 3X4": None,
}.items():
    check("unit strip: " + a[:30], geo.address_without_unit(a) == want, repr(geo.address_without_unit(a)))
check("postal in address", geo.postal_code_in("155 Clarke Road Unit 5 London, ON n5w5c9") == "N5W 5C9" and geo.postal_code_in("no code") is None)

# --- stub geocoders used by main
LOC = {
    "1151 richmond st, london, on": {"lat": 43.00937, "lng": -81.26183, "display_name": "x"},
    "named clinic, london, on": {"lat": 42.98, "lng": -81.24, "display_name": "y"},
}
calls = []
async def fake_geocode_address(q):
    calls.append(q)
    return LOC.get(q.lower())
async def fake_geocode_postal(code):
    return {"lat": 43.00711, "lng": -81.27384, "display_name": "N6A 3K7"} if geo.normalize_postal_code(code) else None
geo.geocode_address, geo.geocode_postal_code, geo.geocode_postal_code = fake_geocode_address, fake_geocode_postal, fake_geocode_postal

def clinic(u, name, address=None):
    return {"name": name, "url": u, "status": "accepting", "evidence_quote": "q", "waitlist_url": None,
            "raw_notes": "ok", "address": address, "lat": None, "lng": None, "distance_km": None}
SCANS = {
    "https://a.ca": clinic("https://a.ca", "Addr Clinic", "1151 Richmond St, London, ON"),
    "https://b.ca": clinic("https://b.ca", "Named Clinic"),                # no address -> name + city fallback
    "https://c.ca": clinic("https://c.ca", "Unknown Clinic"),              # nothing found
}
def fake_scan_one(u):
    if "boom" in u:
        return common.failed_clinic(u, "scan error: boom")
    return dict(SCANS[u])
scanning.scan_one = fake_scan_one
KEYS = {"name", "url", "status", "evidence_quote", "waitlist_url", "raw_notes", "address", "lat", "lng", "distance_km"}

body = {"clinic_urls": ["https://a.ca", "https://b.ca", "https://c.ca", "https://boom.ca"], "user_postal_code": "n6a3k7"}
r = c.post("/api/scan", json=body)
cl = {x["url"]: x for x in r.json()["clinics"]}
check("scan 200, all clinics have map keys", r.status_code == 200 and all(set(x) == KEYS for x in cl.values()), r.text)
a, b, cc, boom = cl["https://a.ca"], cl["https://b.ca"], cl["https://c.ca"], cl["https://boom.ca"]
check("address geocoded", (a["lat"], a["lng"]) == (43.00937, -81.26183) and a["address"] == "1151 Richmond St, London, ON")
check("distance_km rounded 1dp", a["distance_km"] == round(geo.haversine_km(43.00711, -81.27384, 43.00937, -81.26183), 1) and a["distance_km"] == 1.0, str(a))
check("name+city fallback", b["lat"] == 42.98 and b["address"] is None and b["distance_km"] is not None, str(b))
check("not found -> nulls", cc["lat"] is None and cc["distance_km"] is None)
check("failed clinic not geocoded", boom["lat"] is None and not any("boom" in q for q in calls), str(calls))

r = c.post("/api/scan", json={**body, "user_postal_code": None})
check("no postal -> distance null but lat set", all(x["distance_km"] is None for x in r.json()["clinics"]) and r.json()["clinics"][0]["lat"] is not None)
r = c.post("/api/scan", json={**body, "user_postal_code": "N6A"})
check("partial postal -> distance null, no error", r.status_code == 200 and all(x["distance_km"] is None for x in r.json()["clinics"]))
check("postal too long -> 422", c.post("/api/scan", json={**body, "user_postal_code": "x" * 13}).status_code == 422)
r = c.post("/api/scan", json={"clinic_urls": ["https://a.ca"]})
check("old request body (no postal) still works", r.status_code == 200 and r.json()["clinics"][0]["distance_km"] is None)

# --- fail-safe: geocoder raises / hangs
async def raising(q): raise RuntimeError("nominatim down")
geo.geocode_address = raising
r = c.post("/api/scan", json=body)
check("geocoder raising -> scan ok, nulls", r.status_code == 200 and all(x["lat"] is None for x in r.json()["clinics"]), r.text)
async def hanging(q): await asyncio.sleep(30)
geo.geocode_address, scanning.LOCATE_TIMEOUT = hanging, 1
t = time.time()
r = c.post("/api/scan", json=body)
check("geocoder hanging -> bounded, nulls", r.status_code == 200 and time.time() - t < 5 and all(x["lat"] is None for x in r.json()["clinics"]), str(time.time() - t))
geo.geocode_address, scanning.LOCATE_TIMEOUT = fake_geocode_address, 20.0
async def postal_raise(code): raise RuntimeError("down")
geo.geocode_postal_code = postal_raise
r = c.post("/api/scan", json=body)
check("postal geocoder raising -> lat kept, distance null", r.status_code == 200 and r.json()["clinics"][0]["lat"] is not None and all(x["distance_km"] is None for x in r.json()["clinics"]))
geo.geocode_postal_code = fake_geocode_postal

# --- stream
r = c.post("/api/scan/stream", json=body)
ev = [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]
res = {e["clinic"]["url"]: e["clinic"] for e in ev if e["type"] == "clinic_result"}
check("stream: done last, map fields present", ev[-1] == {"type": "done", "total": 4} and all(set(x) == KEYS for x in res.values()), str(ev[-1]))
check("stream: distance computed", res["https://a.ca"]["distance_km"] == 1.0, str(res["https://a.ca"]))

# --- cache: save strips distance, replay recomputes it
config.DEFAULT_CLINIC_URLS[:] = ["https://a.ca", "https://b.ca"]
r = c.post("/api/scan", json={"user_postal_code": "N6A 3K7"})
saved = json.loads(config.CACHE_PATH.read_text(encoding="utf-8"))["clinics"]
check("cache saved with lat/lng, without distance", saved[0]["lat"] == 43.00937 and all(x["distance_km"] is None for x in saved), str(saved[0]))
calls.clear()
r = c.post("/api/scan", json={"use_cache": True, "user_postal_code": "N6A 3K7"})
check("cache replay adds distance without re-geocoding", r.json()["clinics"][0]["distance_km"] == 1.0 and calls == [], str(r.json()) + str(calls))
r = c.post("/api/scan/stream", json={"use_cache": True, "user_postal_code": "N6A 3K7"})
ev = [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]
check("stream cache replay adds distance", ev[0]["clinic"]["distance_km"] == 1.0 and ev[-1]["type"] == "done", str(ev))
old = {k: v for k, v in saved[0].items() if k not in ("address", "lat", "lng", "distance_km")}
config.CACHE_PATH.write_text(json.dumps({"clinics": [old]}), encoding="utf-8")
r = c.post("/api/scan", json={"use_cache": True})
check("old-format cache gets map keys", r.status_code == 200 and set(r.json()["clinics"][0]) == KEYS, r.text)

# --- geo.py internals: cache + circuit breaker (no network: stub httpx)
geo.geocode_address, geo.geocode_postal_code = REAL_GEOCODE_ADDRESS, REAL_GEOCODE_POSTAL
import httpx
class FakeResp:
    def __init__(self, data): self._d = data
    def raise_for_status(self): pass
    def json(self): return self._d
n = {"get": 0}
class FakeClient:
    def __init__(self, *a, **k): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *a): pass
    async def get(self, url, params=None):
        n["get"] += 1
        q = params.get("q", "")
        if "boom" in q: raise httpx.ConnectTimeout("timeout")
        if "quebec" in q: return FakeResp([{"lat": "46.8", "lon": "-71.2", "address": {"state": "Québec"}, "display_name": "QC"}])
        return FakeResp([{"lat": "43.0", "lon": "-81.2", "address": {"state": "Ontario"}, "display_name": "ON"}])
real_client = geo.httpx.AsyncClient
geo.httpx.AsyncClient = FakeClient
geo.MIN_INTERVAL_S = 0
async def run_geo():
    r1 = await geo.geocode_address("10 King St London")
    r2 = await geo.geocode_address("10 king st   london")  # same after normalising -> cached
    q = await geo.geocode_address("somewhere quebec")
    gets_before = n["get"]
    t = time.time()
    b1 = await geo.geocode_address("boom street")
    b2 = await geo.geocode_address("another new street")  # breaker open -> no request
    return r1, r2, q, gets_before, b1, b2, time.time() - t
r1, r2, q, gets_before, b1, b2, dt = asyncio.run(run_geo())
check("geo: result parsed (city is null when the answer has none)", r1 == {"lat": 43.0, "lng": -81.2, "display_name": "ON", "city": None}, str(r1))
check("geo: cache hit (1 request for 2 calls)", r2 == r1 and gets_before == 2, str(n))
check("geo: non-Ontario rejected", q is None)
check("geo: error retried once -> None, breaker skips next lookup", b1 is None and b2 is None and n["get"] == gets_before + 2, str(n))
check("geo: error not cached", "q:boom street" not in geo._cache)
geo.httpx.AsyncClient = real_client
geo._down_until = 0.0
geo.MIN_INTERVAL_S = 1.1

check("real fallback_cache.json untouched", REAL_CACHE.read_bytes() == real_before)
print("\nALL PASSED" if not fails else "\nFAILED: " + str(fails))
