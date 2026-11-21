import asyncio
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from tinyfish import TinyFish

# Load TINYFISH_API_KEY from the repo-root .env (backend/app/main.py -> parents[2])
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

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


@app.post("/api/scan")
async def scan(req: ScanRequest):
    urls = req.clinic_urls or DEFAULT_CLINIC_URLS
    clinics = await asyncio.gather(*(asyncio.to_thread(scan_one, u) for u in urls))
    return {"clinics": list(clinics)}
