"""New features: watching the browser agent live (search + Auto-Fill), reason for visit, hours / wait notes,
the feedback survey, and opening-alert emails. No network, no credits."""
import asyncio, json, os, sys, tempfile, time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace as NS

BACKEND = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, BACKEND)
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp())  # never touch the real clinics.db
os.environ.setdefault("CARESCOUT_SEED", "0")
os.environ.setdefault("DEMO_REPLAY", "0")  # never replay the real demo recording in tests
import app.main as m
from app import config, agents, apply_form, clinic_db, models, notify, ranking, scanning, watchdog
from fastapi.testclient import TestClient
from tinyfish.agent.types import CompleteEvent, ProgressEvent, StartedEvent, StreamingUrlEvent

tmp = Path(tempfile.mkdtemp())
clinic_db.DB_PATH = watchdog.DB_PATH = tmp / "t.db"
os.environ["TINYFISH_API_KEY"] = os.environ["GEMINI_API_KEY"] = "fake"
config.MAX_AGENTS = 10
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else extra)
    if not cond:
        fails.append(name)


NOW = datetime.now(timezone.utc).isoformat()
LIVE = "https://ip-1-2-3-4.tetra-data.production.tinyfish.io/tf-abc/stream/0"


def stream_events(result, live=LIVE, status="COMPLETED"):
    out = [StartedEvent.model_validate({"type": "STARTED", "runId": "r1", "timestamp": NOW})]
    if live:
        out.append(StreamingUrlEvent.model_validate({"type": "STREAMING_URL", "runId": "r1", "streamingUrl": live, "timestamp": NOW}))
    for step in ("Visit clinic website", "Find new patient information"):
        out.append(ProgressEvent.model_validate({"type": "PROGRESS", "runId": "r1", "purpose": step, "timestamp": NOW}))
    out.append(CompleteEvent.model_validate({"type": "COMPLETE", "runId": "r1", "status": status, "timestamp": NOW, "result": result}))
    return out


class FakeAgent:
    """Records how it was called: stream() when someone watches, run() otherwise."""
    def __init__(self, result, live=LIVE):
        self.result, self.live, self.calls = result, live, []

    @contextmanager
    def stream(self, goal, url):
        self.calls.append(("stream", goal, url))
        yield iter(stream_events(self.result, self.live))

    def run(self, goal, url):
        self.calls.append(("run", goal, url))
        return NS(status="COMPLETED", result=self.result, error=None)


def use_agent(result, live=LIVE):
    agent = FakeAgent(result, live)
    config.tinyfish_client = lambda timeout: NS(agent=agent)
    return agent


SCAN_OK = {"name": "A", "status": "accepting", "evidence_quote": "We are accepting new patients.", "raw_notes": "Open Mon-Fri 9-5"}

# ---- run_with_events
agent = use_agent(SCAN_OK)
seen = []
status, result, error = agents.run_with_events(NS(agent=agent), goal="g", url="https://a.ca", on_event=lambda k, v: seen.append((k, v)))
check("streamed run: live view URL then the agent's steps", seen == [("live", LIVE), ("step", "Visit clinic website"), ("step", "Find new patient information")], str(seen))
check("streamed run: result and status like agent.run", status == "COMPLETED" and result == SCAN_OK and error is None and agent.calls[0][0] == "stream")
agent = use_agent(SCAN_OK)
status, result, _ = agents.run_with_events(NS(agent=agent), goal="g", url="https://a.ca")
check("nobody watching: plain agent.run (no stream)", agent.calls[0][0] == "run" and status == "COMPLETED")
seen.clear()
agents.run_with_events(NS(agent=FakeAgent(SCAN_OK, live="wss://not-a-page/x")), goal="g", url="https://a.ca", on_event=lambda k, v: seen.append((k, v)))
check("only https live views are passed on", not any(k == "live" for k, _ in seen), str(seen))


for raw, want in [("Submit final answer with clinic info", "Reporting what it found"), ("Return the final result", "Reporting what it found"), ("Return final JSON with clinic patient acceptance info", "Reporting what it found"),
                  ("Return to the previous page", "Return to the previous page"),
                  ("Fill in the name field", "Fill in the name field"), ("Find the Submit button", "Find the Submit button")]:
    check(f"step label shown to patients: {raw!r}", agents.step_text(raw) == want, agents.step_text(raw))

# ---- scan_clinic streams its events to an async listener
async def scan_and_watch():
    got = []

    async def listener(kind, value):
        got.append((kind, value))

    clinic = await scanning.scan_clinic("https://a.ca", on_event=listener)
    await asyncio.sleep(0.05)  # let the thread-safe callbacks land
    return clinic, got


use_agent(SCAN_OK)
clinic, got = asyncio.run(scan_and_watch())
check("scan with a listener: clinic result unchanged", clinic["status"] == "accepting" and clinic["evidence_quote"].startswith("We are"))
check("scan with a listener: live view + steps arrive", ("live", LIVE) in got and ("step", "Find new patient information") in got, str(got))
agent = use_agent(SCAN_OK)
check("scan without a listener: no stream", scanning.scan_one("https://a.ca")["status"] == "accepting" and agent.calls[0][0] == "run")

# ---- mission: a browser-agent fallback shows up in the feed with its live view
from app import refresh


async def unreadable(url):
    raise refresh.PageReadError("blocked")

refresh.read_page = unreadable
from app import geo


async def no_geo(*a, **k):
    return None

geo.geocode_address = geo.geocode_postal_code = geo.geocode_clinic = no_geo
ranking.rank = lambda req: {"ranked_clinics": []}
use_agent(SCAN_OK)
client = TestClient(m.app)
r = client.post("/api/mission/stream", json={"clinic_urls": ["https://live-agent.ca"], "refresh": "all"})
ev = [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]
lives = [e for e in ev if e["type"] == "agent_status" and e.get("live_url")]
steps = [e["message"] for e in ev if e["type"] == "agent_status" and e["message"].startswith("Agent: ")]
check("mission feed: agent_status carries the live view URL", len(lives) == 1 and lives[0]["live_url"] == LIVE and lives[0]["url"] == "https://live-agent.ca", str(ev)[:500])
check("mission feed: the agent's own steps are listed", steps == ["Agent: Visit clinic website", "Agent: Find new patient information"], str(steps))
check("mission feed: still ends with done", ev[-1]["type"] == "done")

# ---- Auto-Fill: reason for visit + streamed run
info = models.PatientInfo(name="T", email="t@x.ca", phone="1", postal_code="N6A 3K7", reason="Diabetes follow-up and a new family doctor")
goal = apply_form.apply_goal(info)
check("reason for visit goes in the agent's data, only into a matching field", "Diabetes follow-up" in goal and "reason_for_visit" in goal and "if the form has no such field, leave it out" in goal)
check("no reason: nothing about it in the goal", "reason_for_visit" not in apply_form.apply_goal(models.PatientInfo(name="T", email="t@x.ca", phone="1", postal_code="N6A")))
pi = {"name": "T", "email": "t@x.ca", "phone": "1", "postal_code": "N6A 3K7", "reason": "x" * 601}
check("reason is capped (422)", client.post("/api/apply", json={"waitlist_url": "https://f.ca", "patient_info": pi}).status_code == 422)
pi["reason"] = "Ongoing care"
use_agent({"filled": {"Name": "T", "Reason": "Ongoing care"}, "summary": "Filled 2 fields", "submitted": False})
r = client.post("/api/apply/stream", json={"waitlist_url": "https://f.ca/form", "patient_info": pi})
ev = [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")]
types = [e["type"] for e in ev]
check("apply stream: live view, steps, then the result last", "live" in types and "step" in types and types[-1] == "result"
      and ev[-1]["result"]["status"] == "ready_for_review" and ev[-1]["result"]["filled_fields"]["Reason"] == "Ongoing care", str(ev)[:400])
use_agent({"filled": {"Name": "T"}, "summary": "sent", "submitted": True})
r = client.post("/api/apply/stream", json={"waitlist_url": "https://f.ca/form", "patient_info": pi})
last = [json.loads(l[6:]) for l in r.text.split("\n\n") if l.startswith("data: ")][-1]
check("apply stream: a reported submit is still an error (guardrail)", last["result"]["status"] == "error" and "SUBMITTED" in last["result"]["summary"])
check("apply stream: http:// refused (422)", client.post("/api/apply/stream", json={"waitlist_url": "http://f.ca", "patient_info": pi}).status_code == 422)
config.PUBLIC_DEMO = True
check("apply stream: off on the public demo (403)", client.post("/api/apply/stream", json={"waitlist_url": "https://f.ca", "patient_info": pi}).status_code == 403)
config.PUBLIC_DEMO = False

# ---- hours / wait notes from ranking
check("ranked clinics carry hours and wait_note", {"hours", "wait_note"} <= set(models.RankedClinic.model_fields))
check("rank prompt never invents waits", "Never estimate or invent a wait time" in open(ranking.__file__, encoding="utf-8").read())

# ---- feedback survey
r = client.post("/api/feedback", json={"helped": "yes", "ease": 5, "comment": "Found one!", "page": "find"})
check("feedback saved", r.status_code == 200 and r.json()["saved"] is True, r.text)
client.post("/api/feedback", json={"helped": "somewhat", "ease": 3})
client.post("/api/feedback", json={"helped": "no"})
s = client.get("/api/feedback/summary").json()
check("feedback summary: counts and average, no comments", s == {"count": 3, "helped": {"yes": 1, "somewhat": 1, "no": 1}, "average_ease": 4.0}, str(s))
check("feedback: bad answer 422", client.post("/api/feedback", json={"helped": "maybe"}).status_code == 422)
check("feedback: ease out of range 422", client.post("/api/feedback", json={"helped": "yes", "ease": 9}).status_code == 422)
check("feedback: long comment 422", client.post("/api/feedback", json={"helped": "yes", "comment": "x" * 1001}).status_code == 422)
config.PUBLIC_DEMO, config.PUBLIC_RATE_LIMIT = True, 2
m._hits.clear()
codes = [client.post("/api/feedback", json={"helped": "yes"}, headers={"X-Forwarded-For": "7.7.7.7"}).status_code for _ in range(3)]
check("feedback allowed on the public demo, rate-limited", codes == [200, 200, 429], str(codes))
config.PUBLIC_DEMO, config.PUBLIC_RATE_LIMIT = False, 30
m._hits.clear()

# ---- opening-alert emails
sent = []
notify._post = lambda payload: sent.append(payload)
config.RESEND_API_KEY = ""
w = watchdog.add_watch("Alpha Clinic", "https://alpha.ca", "closed", "patient@gmail.com")
alert = watchdog.make_alert(w, "accepting", "We are now accepting new patients.")
watchdog.save_alerts([alert], {w["id"]: "patient@gmail.com"})
time.sleep(0.2)
check("email off without RESEND_API_KEY", sent == [])
config.RESEND_API_KEY = "re_test"
watchdog.save_alerts([alert], {w["id"]: "patient@gmail.com"})
time.sleep(0.3)
check("real alert: one email to the watcher", len(sent) == 1 and sent[0]["to"] == ["patient@gmail.com"]
      and sent[0]["subject"] == "Alpha Clinic is now accepting new patients" and "We are now accepting new patients." in sent[0]["text"], str(sent)[:300])
check("email links the clinic", "https://alpha.ca" in sent[0]["html"] and "https://alpha.ca" in sent[0]["text"])
sent.clear()
watchdog.save_alerts([alert], {w["id"]: "patient@gmail.com"}, simulated=True)
time.sleep(0.2)
check("previews never email", sent == [])
for addr in (config.DEMO_EMAIL, "someone@example.com", "x@clinic.test"):
    check(f"no email to {addr}", notify.deliverable(addr) is False)
r = client.post("/api/watch/simulate-opening", json={"watch_id": w["id"]})
time.sleep(0.2)
check("simulate-opening (preview) sends nothing", r.status_code == 200 and sent == [], str(sent))
bad = {**alert, "clinic_name": "<script>x</script>", "evidence_quote": "<b>hi</b>"}
check("email HTML is escaped", "<script>" not in notify.build_email(bad)["html"])
notify._post = lambda payload: (_ for _ in ()).throw(RuntimeError("down"))
check("email failure never breaks saving alerts", watchdog.save_alerts([alert], {w["id"]: "patient@gmail.com"}) is None)
config.RESEND_API_KEY = ""

# ---- phone numbers and call scripts are checked against the clinic's own data
src_phone_only = {"url": "https://p.ca", "waitlist_url": None, "raw_notes": "Call (519) 555-0142 to register.", "evidence_quote": "", "address": None}
r1 = {"phone_number": "519-555-0142", "call_script": "Hello..."}
ranking.enforce_contact_rules(r1, src_phone_only)
check("real number from the site is kept, with its call script", r1["phone_number"] == "519-555-0142" and r1["call_script"] == "Hello...")
r2 = {"phone_number": "519-555-9999", "call_script": "Hello..."}
ranking.enforce_contact_rules(r2, src_phone_only)
check("a number that isn't on the site is dropped (and so is the script)", r2["phone_number"] is None and r2["call_script"] is None, str(r2))
r3 = {"phone_number": None, "call_script": "Hello..."}
ranking.enforce_contact_rules(r3, {**src_phone_only, "raw_notes": "No phone listed."})
check("no number: no call script", r3["call_script"] is None)
r4 = {"phone_number": "519-555-0142", "call_script": "Hello..."}
ranking.enforce_contact_rules(r4, {**src_phone_only, "waitlist_url": "https://p.ca/form"})
check("clinic with an online form: number kept, no call script", r4["phone_number"] == "519-555-0142" and r4["call_script"] is None)

# ---- Auto-Fill on the public demo: on, but only for known clinic forms and within limits
config.PUBLIC_DEMO, config.PUBLIC_APPLY, config.PUBLIC_APPLY_PER_HOUR, config.PUBLIC_APPLY_PER_DAY = True, True, 2, 40
m._apply_hits.clear(); m._apply_day.clear()
check("health tells the site Auto-Fill is available", client.get("/health").json() == {"status": "ok", "public_demo": True, "apply": True})
clinic_db.add_url("https://known.ca", "London, ON")
clinic_db.save_check("https://known.ca", "London, ON", {"name": "K", "url": "https://known.ca", "status": "accepting", "evidence_quote": "We accept new patients",
                     "waitlist_url": "https://forms.example-host.com/k/123", "raw_notes": "", "address": None, "lat": None, "lng": None}, None, "page")
use_agent({"filled": {"Name": "T"}, "summary": "ok", "submitted": False})
H = {"X-Forwarded-For": "8.8.8.8"}
r = client.post("/api/apply", json={"waitlist_url": "https://forms.example-host.com/k/123/", "patient_info": pi}, headers=H)
check("public: Auto-Fill works for a form CareScout found", r.status_code == 200 and r.json()["status"] == "ready_for_review", r.text)
r = client.post("/api/apply", json={"waitlist_url": "https://attacker.example/form", "patient_info": pi}, headers=H)
check("public: any other address is refused (403)", r.status_code == 403 and "clinic forms CareScout found" in r.json()["detail"], r.text)
r = client.post("/api/apply/stream", json={"waitlist_url": "https://forms.example-host.com/k/123", "patient_info": pi}, headers=H)
check("public: per-visitor hourly limit (429)", r.status_code == 429 and "Auto-Fill" in r.json()["detail"], r.text)
r = client.post("/api/apply", json={"waitlist_url": "https://forms.example-host.com/k/123", "patient_info": pi}, headers={"X-Forwarded-For": "9.9.9.9"})
check("public: another visitor still can", r.status_code == 200, r.text)
config.PUBLIC_APPLY_PER_DAY = 3
r = client.post("/api/apply", json={"waitlist_url": "https://forms.example-host.com/k/123", "patient_info": pi}, headers={"X-Forwarded-For": "6.6.6.6"})
check("public: site-wide daily limit (429)", r.status_code == 429 and "today's limit" in r.json()["detail"], r.text)
config.PUBLIC_APPLY = False
check("PUBLIC_APPLY=0: off for visitors (403), and health says so",
      client.post("/api/apply", json={"waitlist_url": "https://forms.example-host.com/k/123", "patient_info": pi}).status_code == 403
      and client.get("/health").json()["apply"] is False)
config.ADMIN_KEY = "adm"
check("admin key skips the limits", client.post("/api/apply", json={"waitlist_url": "https://anything.ca/f", "patient_info": pi}, headers={"X-Admin-Key": "adm"}).status_code == 200)

# ---- reading the feedback comments: team only
r = client.get("/api/feedback")
check("public: comments need the admin key (403)", r.status_code == 403, r.text)
r = client.get("/api/feedback", headers={"X-Admin-Key": "adm"})
items = r.json().get("feedback", [])
check("admin: every answer with its comment, newest first", r.status_code == 200 and items and items[-1]["comment"] == "Found one!"
      and items[0]["id"] > items[-1]["id"] and r.json()["summary"]["count"] == len(items), r.text[:300])
config.PUBLIC_DEMO, config.PUBLIC_APPLY, config.PUBLIC_APPLY_PER_DAY, config.ADMIN_KEY = False, True, 40, ""
check("local (no admin key set): comments readable", client.get("/api/feedback").status_code == 200)

# ---- any Ontario city: postal code -> city
async def toronto(code):
    return {"lat": 43.64, "lng": -79.39, "display_name": "M5V 3L9, Toronto", "city": "Toronto, ON"}
geo.geocode_postal_code = toronto
j = client.get("/api/locate", params={"postal_code": "m5v3l9"}).json()
check("locate: postal code -> city", j == {"postal_code": "M5V 3L9", "city": "Toronto, ON", "found": True}, str(j))
check("locate: partial code -> nothing", client.get("/api/locate", params={"postal_code": "M5V"}).json()["found"] is False)
geo.geocode_postal_code = no_geo


print("\nALL PASSED" if not fails else "\nFAILED: " + str(fails))
sys.exit(1 if fails else 0)
