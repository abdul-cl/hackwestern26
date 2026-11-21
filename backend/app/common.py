"""Small helpers shared by several features (URL checks, Gemini JSON parsing, SSE, failed-scan clinics)."""
import asyncio
import json
import re
from urllib.parse import urlparse

FAIL_PREFIXES = ("scan failed", "scan error")  # raw_notes prefix of a clinic whose scan did not work


def is_http_url(url: str) -> bool:
    parts = urlparse(url.strip())
    return parts.scheme in ("http", "https") and bool(parts.netloc)


def parse_gemini(resp, model):
    """Parse a Gemini reply into a pydantic model, tolerating ```json fences."""
    try:
        text = (resp.text or "").strip()
    except Exception:
        text = ""
    if not text:
        raise ValueError("Gemini returned an empty response (it may have been blocked)")
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE).strip()
    return model.model_validate_json(text)


def failed_clinic(url: str, note: str) -> dict:
    return {
        "name": url, "url": url, "status": "closed",
        "evidence_quote": "", "waitlist_url": None, "raw_notes": note,
        "address": None, "lat": None, "lng": None, "distance_km": None,
    }


def is_failed(clinic: dict) -> bool:
    return str(clinic.get("raw_notes", "")).startswith(FAIL_PREFIXES)


# Doctor directories / referral lists: useful to a patient, but not a clinic they can join. Never shown as one.
DIRECTORY_MARKERS = ("ldam.ca", "find-a-doctor", "findadoctor", "find_a_doctor", "doctor-directory", "physician-directory")


def is_directory_url(url: str) -> bool:
    u = (url or "").lower()
    return any(m in u for m in DIRECTORY_MARKERS)


def sse(event: dict) -> str:
    return "data: " + json.dumps(event) + "\n\n"


KEEPALIVE = ": keep-alive\n\n"


async def wait_with_keepalive(task: asyncio.Task):
    """Yield SSE keep-alive comments every 15s until the task finishes (long Gemini/TinyFish calls)."""
    while not task.done():
        done, _ = await asyncio.wait({task}, timeout=15)
        if not done:
            yield KEEPALIVE
