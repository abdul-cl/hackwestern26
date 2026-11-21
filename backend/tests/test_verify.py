"""POST /api/verify-doctor with a stubbed TinyFish agent. No network, no credits."""
import os, sys, tempfile, time
from pathlib import Path
from types import SimpleNamespace as NS

BACKEND = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, BACKEND)
import app.main as m
import app.watchdog as wd
from fastapi.testclient import TestClient

tmp = Path(tempfile.mkdtemp())
m.CACHE_PATH, wd.DB_PATH = tmp / "cache.json", tmp / "t.db"
os.environ["TINYFISH_API_KEY"] = "fake"
m.MAX_AGENTS = 50
c = TestClient(m.app, raise_server_exceptions=False).__enter__()
fails = []
KEYS = {"verified", "cpso_number", "registration_status", "specialty", "languages", "gender", "profile_url", "notes", "lookup_status"}


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else extra)
    if not cond:
        fails.append(name)


class Run:
    def __init__(self, result, status="COMPLETED", error=None):
        self.result, self.status, self.error = result, status, error


goals = []
def agent_returning(result=None, status="COMPLETED", error=None, sleep=0, exc=None):
    def run(**kw):
        goals.append(kw)
        if sleep:
            time.sleep(sleep)
        if exc:
            raise exc
        return Run(result, status, error)
    m.tinyfish_client = lambda timeout: NS(agent=NS(run=run))
    m._verify_cache.clear()


def verify(name="Jane Smith", city="London"):
    r = c.post("/api/verify-doctor", json={"doctor_name": name, "city": city})
    return r.status_code, r.json()


FOUND = {"found": True, "cpso_number": "CPSO# 123456", "registration_status": "Active Member", "specialty": "Family Medicine",
         "languages": ["English", "French"], "gender": "Female", "profile_url": "https://doctors.cpso.on.ca/DoctorDetails/Jane-Smith/0123456-123456",
         "notes": "Found one active family physician in London."}

agent_returning(FOUND)
code, j = verify("Dr. Jane  Smith")
check("found active -> verified", code == 200 and j["verified"] is True and j["lookup_status"] == "found" and set(j) == KEYS, str(j))
check("cpso_number digits only", j["cpso_number"] == "123456")
check("fields passed through", j["specialty"] == "Family Medicine" and j["languages"] == ["English", "French"] and j["gender"] == "Female")
check("agent goes to CPSO, 'Dr.' stripped from name", goals[-1]["url"] == "https://doctors.cpso.on.ca/" and '"Jane Smith"' in goals[-1]["goal"] and "Dr." not in goals[-1]["goal"], str(goals[-1]))

n = len(goals)
code, j2 = verify("jane smith", "london")
check("found result cached (no 2nd agent run)", j2 == j and len(goals) == n)

agent_returning({**FOUND, "registration_status": "Inactive"})
code, j = verify()
check("inactive -> not verified, explained", j["verified"] is False and j["lookup_status"] == "found" and "not active" in j["notes"], str(j))
agent_returning({**FOUND, "registration_status": None})
check("no status -> not verified", verify()[1]["verified"] is False)
agent_returning({**FOUND, "profile_url": "https://evil.com/phish"})
check("non-CPSO profile_url dropped", verify()[1]["profile_url"] is None)
agent_returning({**FOUND, "languages": "English"})
check("bad languages type -> []", verify()[1]["languages"] == [])

agent_returning({"found": False, "notes": ""})
code, j = verify("Nobody Real")
check("not found -> 200 verified false + helpful notes", code == 200 and j["verified"] is False and j["lookup_status"] == "not_found"
      and "Nobody Real" in j["notes"] and "doctors.cpso.on.ca" in j["notes"], str(j))
n = len(goals)
verify("Nobody Real")
check("not-found is not cached", len(goals) == n + 1)

agent_returning(None, status="FAILED", error=NS(message="site blocked"))
code, j = verify()
check("agent failed -> 200 error", code == 200 and j["lookup_status"] == "error" and "site blocked" in j["notes"], str(j))
agent_returning("weird")
check("odd result -> 200 error", verify()[1]["lookup_status"] == "error")
agent_returning(exc=RuntimeError("network down"))
code, j = verify()
check("exception -> 200 error", code == 200 and "network down" in j["notes"], str(j))

m.VERIFY_TIMEOUT = 0.5
agent_returning(FOUND, sleep=2)
t = time.time()
code, j = verify()
check("timeout -> 200 verified false", code == 200 and j["lookup_status"] == "timeout" and j["verified"] is False and time.time() - t < 1.5, str(j))
m.VERIFY_TIMEOUT = 45

check("name too short -> 422", c.post("/api/verify-doctor", json={"doctor_name": "J"}).status_code == 422)
check("missing name -> 422", c.post("/api/verify-doctor", json={"city": "London"}).status_code == 422)
check("city defaults to London", c.post("/api/verify-doctor", json={"doctor_name": "Jane Smith"}).status_code == 200)
os.environ.pop("TINYFISH_API_KEY")
m._verify_cache.clear()
code, j = verify()
check("missing TinyFish key -> JSON 500", code == 500 and "TINYFISH_API_KEY" in j["detail"], str(j))

print("\nALL PASSED" if not fails else "\nFAILED: " + str(fails))
