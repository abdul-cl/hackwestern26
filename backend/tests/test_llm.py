"""Gemini retries + backup models (llm.generate_json) and how ranking / page reading use them. No network, no credits."""
import json, os, sys, tempfile
from pathlib import Path
from types import SimpleNamespace as NS

BACKEND = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, BACKEND)
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp())  # never touch the real clinics.db
os.environ.setdefault("CARESCOUT_SEED", "0")
os.environ.setdefault("DEMO_REPLAY", "0")  # never replay the real demo recording in tests
import httpx
from google.genai import errors
import app.main as m
from app import config, llm, models, refresh
from fastapi.testclient import TestClient

os.environ["TINYFISH_API_KEY"] = os.environ["GEMINI_API_KEY"] = "fake"
config.GEMINI_RPM = 60000
llm.RETRY_DELAY_S = 0
config.GEMINI_MODEL, config.GEMINI_FALLBACK_MODELS, config.GEMINI_RETRIES = "main-model", ["backup-model"], 2
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else extra)
    if not cond:
        fails.append(name)


def overloaded():
    return errors.ServerError(503, {"error": {"code": 503, "message": "This model is currently experiencing high demand.", "status": "UNAVAILABLE"}})


def rate_limited():
    return errors.ClientError(429, {"error": {"code": 429, "message": "Quota exceeded", "status": "RESOURCE_EXHAUSTED"}})


class Script:
    """Fake Gemini client: `plan` maps model name -> list of outcomes (an Exception to raise, or reply text)."""
    def __init__(self, plan):
        self.plan = {k: list(v) for k, v in plan.items()}
        self.calls = []
        self.models = self

    def generate_content(self, model, contents, config):
        self.calls.append(model)
        outcome = self.plan[model].pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return NS(text=outcome)


def use(plan):
    fake = Script(plan)
    config.gemini_client = lambda: fake
    return fake


PICKS = json.dumps({"clinic_urls": ["https://a.ca"]})

# ---- classification
check("503 is transient", llm.is_transient(overloaded()))
check("429 is transient", llm.is_transient(rate_limited()))
check("timeout is transient", llm.is_transient(httpx.ReadTimeout("timed out")))
check("400 bad request is not transient", not llm.is_transient(errors.ClientError(400, {"error": {"code": 400, "message": "bad", "status": "INVALID_ARGUMENT"}})))
check("JSON error is not transient", not llm.is_transient(ValueError("Invalid JSON")))
config.GEMINI_FALLBACK_MODELS = ["backup-model", "main-model", ""]
check("model list: main first, no duplicates or blanks", llm.model_list() == ["main-model", "backup-model"], llm.model_list())
config.GEMINI_FALLBACK_MODELS = ["backup-model"]

# ---- generate_json
fake = use({"main-model": [PICKS]})
check("healthy model answers first try", llm.generate_json("p", models.UrlPicks).clinic_urls == ["https://a.ca"] and fake.calls == ["main-model"])

fake = use({"main-model": [overloaded(), PICKS]})
check("503 then retry on same model works", llm.generate_json("p", models.UrlPicks).clinic_urls == ["https://a.ca"] and fake.calls == ["main-model", "main-model"])

fake = use({"main-model": [overloaded(), overloaded()], "backup-model": [PICKS]})
check("still busy -> backup model answers", llm.generate_json("p", models.UrlPicks).clinic_urls == ["https://a.ca"]
      and fake.calls == ["main-model", "main-model", "backup-model"], fake.calls)

fake = use({"main-model": [httpx.ReadTimeout("timed out")], "backup-model": [PICKS]})
llm.generate_json("p", models.UrlPicks)
check("timeout skips straight to backup (no second wait)", fake.calls == ["main-model", "backup-model"], fake.calls)

fake = use({"main-model": [rate_limited(), rate_limited()], "backup-model": [rate_limited(), overloaded()]})
try:
    llm.generate_json("p", models.UrlPicks); check("all busy raises", False)
except errors.APIError as e:
    check("all busy raises the last error", e.code == 503 and len(fake.calls) == 4, fake.calls)

fake = use({"main-model": [errors.ClientError(400, {"error": {"code": 400, "message": "bad", "status": "INVALID_ARGUMENT"}})]})
try:
    llm.generate_json("p", models.UrlPicks); check("400 raises", False)
except errors.ClientError:
    check("400 is not retried or switched", fake.calls == ["main-model"], fake.calls)

fake = use({"main-model": ["not json"]})
try:
    llm.generate_json("p", models.UrlPicks); check("bad JSON raises", False)
except Exception:
    check("bad JSON raises without retrying", fake.calls == ["main-model"], fake.calls)

# ---- POST /api/rank recovers from an overloaded model
client = TestClient(m.app)
ranked = {"ranked_clinics": [{"name": "A", "url": "https://a.ca", "score": 90, "reason": "r", "requirements": [], "next_step": "n",
                              "coverage_tags": [], "phone_number": None, "call_hours": None, "call_script": None}]}
clinic = {"name": "A", "url": "https://a.ca", "status": "accepting", "evidence_quote": "q", "waitlist_url": None, "raw_notes": ""}
fake = use({"main-model": [overloaded(), overloaded()], "backup-model": [json.dumps(ranked)]})
r = client.post("/api/rank", json={"clinics": [clinic]})
check("rank survives a 503 via backup model", r.status_code == 200 and r.json()["ranked_clinics"][0]["score"] == 90, r.text)

fake = use({"main-model": [overloaded(), overloaded()], "backup-model": [overloaded(), overloaded()]})
r = client.post("/api/rank", json={"clinics": [clinic]})
check("rank: every model busy -> JSON 502", r.status_code == 502 and "rank failed" in r.json()["detail"], r.text)

class KeyRejected(Exception):
    code = 401
fake = use({"main-model": [KeyRejected("401 UNAUTHENTICATED. API key not valid. Please pass a valid API key.")]})
r = client.post("/api/rank", json={"clinics": [clinic]})
check("rank: rejected key -> plain-English 502, no retries", r.status_code == 502 and "Gemini API key" in r.json()["detail"]
      and "UNAUTHENTICATED" not in r.json()["detail"] and fake.calls == ["main-model"], (r.text, fake.calls))

os.environ["GEMINI_API_KEY"] = ""
r = client.post("/api/rank", json={"clinics": [clinic]})
check("rank: missing key is still a JSON 500", r.status_code == 500, r.text)
os.environ["GEMINI_API_KEY"] = "fake"

# ---- page reading recovers too
page = {"name": "A", "status": "accepting", "evidence_quote": "We are accepting new patients.", "waitlist_url": None,
        "address": None, "raw_notes": "", "better_url": None}
fake = use({"main-model": [overloaded(), overloaded()], "backup-model": [json.dumps(page)]})
got = refresh.gemini_read("https://a.ca", "A", "We are accepting new patients.", [])
check("page read survives a 503 via backup model", got.status == "accepting" and fake.calls[-1] == "backup-model", fake.calls)

print("\nALL PASSED" if not fails else "\nFAILED: " + str(fails))
sys.exit(1 if fails else 0)
