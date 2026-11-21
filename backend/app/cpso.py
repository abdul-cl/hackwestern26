"""Verify a doctor on the CPSO public register: POST /api/verify-doctor."""
import asyncio
import json
import re
import time

from fastapi import APIRouter

from . import config, models, agents

router = APIRouter()
CPSO_URL = "https://doctors.cpso.on.ca/"
VERIFY_CACHE_S = 3600  # reuse a found result for an hour (saves agent runs during demos)
_verify_cache: dict[str, tuple[float, dict]] = {}


def verify_goal(doctor_name: str, city: str) -> str:
    return (
        "Use the College of Physicians and Surgeons of Ontario (CPSO) public register on this site to look up "
        f"the doctor named {json.dumps(doctor_name)} practising in or near {json.dumps(city)}, Ontario. "
        "Use the doctor search (by name, and by city/location if the form has it). Do not log in or create an account. "
        "If several doctors match, pick the one whose practice location is in that city; if it is still ambiguous, "
        "pick none and say so in notes. Open the matching doctor's profile and return JSON with: "
        "found (true if a matching doctor profile was found), "
        "cpso_number (the CPSO registration number as shown, else null), "
        "registration_status (e.g. 'Active Member', 'Inactive', 'Expired', exactly as shown, else null), "
        "specialty (e.g. 'Family Medicine', else null), "
        "languages (list of languages the profile says the doctor speaks; empty list if none listed), "
        "gender (as listed, else null), "
        "profile_url (the URL of the doctor's profile page, else null), "
        "notes (one or two sentences: what you found, or why you could not find a match). "
        "Only report what the register actually shows; never guess."
    )


def verify_result(verified: bool = False, lookup_status: str = "error", notes: str = "", **fields) -> dict:
    out = {
        "verified": verified, "cpso_number": None, "registration_status": None, "specialty": None,
        "languages": [], "gender": None, "profile_url": None, "notes": notes, "lookup_status": lookup_status,
    }
    out.update(fields)
    return out


def is_active_status(status: str | None) -> bool:
    s = (status or "").lower()
    return "active" in s and not any(bad in s for bad in ("inactive", "not active", "non-active"))


def clean_verify(res: dict, doctor_name: str, city: str) -> dict:
    """Turn the agent's JSON into the response, trusting nothing it says without checks."""
    def text(key, limit=200):
        v = res.get(key)
        return str(v).strip()[:limit] if v not in (None, "", []) else None

    status = text("registration_status", 80)
    number = re.sub(r"\D", "", text("cpso_number", 20) or "") or None
    profile = text("profile_url", 500)
    if profile and not profile.startswith("https://doctors.cpso.on.ca/"):
        profile = None  # only ever link to the official register
    langs = res.get("languages") if isinstance(res.get("languages"), list) else []
    fields = dict(
        cpso_number=number, registration_status=status, specialty=text("specialty"),
        languages=[str(l).strip()[:40] for l in langs if str(l).strip()][:15],
        gender=text("gender", 40), profile_url=profile,
    )
    notes = text("notes", 500) or ""
    if not res.get("found"):
        return verify_result(False, "not_found", notes or f"No CPSO registration found for {doctor_name} in {city}. "
                             "Check the spelling, try without 'Dr.', or search the register directly: " + CPSO_URL)
    # Verified only when the register shows an active registration (not just "the agent said so").
    verified = is_active_status(status)
    if not verified:
        notes = (notes + " " if notes else "") + (
            f"Registration status is '{status}', not active." if status else "The registration status could not be confirmed."
        )
    return verify_result(verified, "found", notes, **fields)


@router.post("/api/verify-doctor")
async def verify_doctor(req: models.VerifyDoctorRequest):
    """Look a doctor up on the official CPSO register. Always 200 with the same shape once the request is valid."""
    name = " ".join(req.doctor_name.split())
    name = re.sub(r"^(dr\.?|doctor)\s+", "", name, flags=re.IGNORECASE) or name
    city = " ".join(req.city.split()) or "London"
    key = f"{name.lower()}|{city.lower()}"
    hit = _verify_cache.get(key)
    if hit and time.monotonic() - hit[0] < VERIFY_CACHE_S:
        return hit[1]
    config.require_key("TINYFISH_API_KEY")

    def run() -> dict:
        try:
            r = config.tinyfish_client(timeout=config.VERIFY_TIMEOUT + 15).agent.run(goal=verify_goal(name, city), url=CPSO_URL)
            if r.status != "COMPLETED" or not r.result:
                msg = r.error.message if r.error else f"run {r.status}"
                return verify_result(False, "error", f"The CPSO lookup did not finish ({msg}). Try again, or search {CPSO_URL} directly.")
            if not isinstance(r.result, dict):
                return verify_result(False, "error", f"The CPSO lookup returned an unexpected result. Search {CPSO_URL} directly.")
            return clean_verify(r.result, name, city)
        except Exception as e:
            return verify_result(False, "error", f"The CPSO lookup failed ({str(e)[:150]}). Search {CPSO_URL} directly.")

    try:
        result = await agents.run_agent(run, config.VERIFY_TIMEOUT)
    except asyncio.TimeoutError:
        return verify_result(False, "timeout", f"The CPSO lookup took longer than {config.VERIFY_TIMEOUT:.0f}s. "
                             f"Try again in a moment, or search {CPSO_URL} directly.")
    except Exception as e:
        return verify_result(False, "error", f"The CPSO lookup failed ({str(e)[:150]}). Search {CPSO_URL} directly.")
    if result["lookup_status"] == "found":
        _verify_cache[key] = (time.monotonic(), result)
    return result
