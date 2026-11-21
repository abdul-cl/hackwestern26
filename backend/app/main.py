import asyncio
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel
from tinyfish import TinyFish

# Load TINYFISH_API_KEY from the repo-root .env (backend/app/main.py -> parents[2])
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

CACHE_PATH = Path(__file__).resolve().parents[1] / "fallback_cache.json"
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")  # 2.5-flash is closed to new keys; 3.8-flash hangs

DEFAULT_CLINIC_URLS = [
    "https://www.ldam.ca/find-a-doctor",
    "https://thamesvalleyfht.ca/become-a-patient/",
    "https://londonfht.ca/looking-for-a-primary-care-provider-apply-here-now/",
    "https://icaremedicallondon.ca/",
    "https://www.wonderlandsouthmedicalcentre.ca",
]

GOAL = (
    "Find out if this clinic is accepting new patients. Return JSON with: "
    "name (clinic name), status ('accepting', 'waitlist', or 'closed'), "
    "evidence_quote (exact sentence from the page supporting the status), "
    "waitlist_url (URL of a waitlist/intake form if any, else null), "
    "raw_notes (short summary of requirements or details)."
)

app = FastAPI(title="CareScout API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScanRequest(BaseModel):
    city: str = "London, ON"
    preferences: list[str] = []
    clinic_urls: list[str] = []
    use_cache: bool = False


class RankRequest(BaseModel):
    preferences: list[str] = []
    clinics: list[dict]


class PatientInfo(BaseModel):
    name: str
    email: str
    phone: str
    postal_code: str


class ApplyRequest(BaseModel):
    waitlist_url: str
    patient_info: PatientInfo


class RankedClinic(BaseModel):
    name: str
    score: int
    reason: str
    requirements: list[str]
    next_step: str


class RankResponse(BaseModel):
    ranked_clinics: list[RankedClinic]


def scan_one(url: str) -> dict:
    """Blocking TinyFish call for one clinic; always returns a contract-shaped dict."""
    fallback = {
        "name": url, "url": url, "status": "closed",
        "evidence_quote": "", "waitlist_url": None, "raw_notes": "",
    }
    try:
        client = TinyFish()  # reads TINYFISH_API_KEY from env
        run = client.agent.run(goal=GOAL, url=url)
        if run.status != "COMPLETED" or not run.result:
            msg = run.error.message if run.error else f"run {run.status}"
            return {**fallback, "raw_notes": f"scan failed: {msg}"}
        r = run.result
        status = r.get("status") if r.get("status") in ("accepting", "waitlist", "closed") else "closed"
        return {
            "name": r.get("name") or url,
            "url": url,
            "status": status,
            "evidence_quote": r.get("evidence_quote") or "",
            "waitlist_url": r.get("waitlist_url") or None,
            "raw_notes": r.get("raw_notes") or "",
        }
    except Exception as e:
        return {**fallback, "raw_notes": f"scan error: {e}"}


@app.get("/health")
def health():
    return {"status": "ok"}


def save_cache(result: dict) -> None:
    """Save a fully successful live scan so we have a backup if Wi-Fi drops."""
    clinics = result["clinics"]
    if clinics and all(not c["raw_notes"].startswith(("scan failed", "scan error")) for c in clinics):
        CACHE_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")


@app.post("/api/scan")
async def scan(req: ScanRequest):
    if req.use_cache and CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    urls = req.clinic_urls or DEFAULT_CLINIC_URLS
    clinics = await asyncio.gather(*(asyncio.to_thread(scan_one, u) for u in urls))
    result = {"clinics": list(clinics)}
    save_cache(result)
    return result


@app.post("/api/rank")
def rank(req: RankRequest):
    prompt = (
        "You rank Ontario family-doctor clinics for a patient.\n"
        f"Patient preferences: {json.dumps(req.preferences)}\n"
        f"Clinics (scan results): {json.dumps(req.clinics)}\n\n"
        "Return every clinic, best first. For each: name (same as input), "
        "score (integer 0-100; clinics accepting new patients and matching preferences score highest, "
        "waitlist middle, closed lowest), reason (one sentence), requirements "
        "(list of things the patient needs to join, from the notes; empty list if none), "
        "next_step (one short action the patient should take). Use only the given data."
    )
    try:
        client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        resp = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=RankResponse,
            ),
        )
        ranked = RankResponse.model_validate_json(resp.text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"rank failed: {e}")
    return {"ranked_clinics": sorted((c.model_dump() for c in ranked.ranked_clinics), key=lambda c: -c["score"])}


def apply_goal(info: PatientInfo) -> str:
    return (
        "Find the new-patient waitlist or intake form on this page. Fill in ONLY the fields that match "
        f"this patient: name={info.name!r}, email={info.email!r}, phone={info.phone!r}, "
        f"postal_code={info.postal_code!r}. Leave every other field blank. "
        "CRITICAL: do NOT click the final Submit / Send / Register button and do not submit the form in any way. "
        "Stop once the fields are filled. "
        "If the form is blocked (captcha, login required, no form found), do not try to get around it. "
        "Return JSON with: filled (object mapping each field label you filled to the value), "
        "summary (one or two sentences on what you did), "
        "blocked (true if you could not fill the form, else false), "
        "screenshot_url (URL of a screenshot of the filled form if you can provide one, else null)."
    )


@app.post("/api/apply")
async def apply(req: ApplyRequest):
    """Fills the waitlist form and stops BEFORE Submit (human-in-the-loop)."""
    def blocked(status: str, msg: str) -> dict:
        return {"status": status, "filled_fields": {}, "summary": msg, "screenshot_url": None}

    def run() -> dict:
        try:
            client = TinyFish()
            r = client.agent.run(goal=apply_goal(req.patient_info), url=req.waitlist_url)
            if r.status != "COMPLETED" or not r.result:
                msg = r.error.message if r.error else f"run {r.status}"
                return blocked("blocked", f"Could not fill the form: {msg}")
            res = r.result
            if res.get("blocked"):
                return blocked("blocked", res.get("summary") or "The site blocked the form.")
            return {
                "status": "ready_for_review",
                "filled_fields": res.get("filled") or {},
                "summary": res.get("summary") or "",
                "screenshot_url": res.get("screenshot_url") or None,
            }
        except Exception as e:
            return blocked("error", f"Apply failed: {e}")

    return await asyncio.to_thread(run)
