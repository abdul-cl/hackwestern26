"""Verify a doctor on the CPSO public register: POST /api/verify-doctor."""
import asyncio
import json
import re
import time

import httpx
from fastapi import APIRouter

from . import config, models, agents

router = APIRouter()
CPSO_URL = "https://register.cpso.on.ca/"  # the CPSO register (doctors.cpso.on.ca redirects here since 2025)
PROFILE_PREFIXES = ("https://register.cpso.on.ca/", "https://doctors.cpso.on.ca/")  # the only links we ever show
SEARCH_URL = CPSO_URL + "Get-Search-Results/"  # the register's own search (what its search page calls), JSON
VERIFY_CACHE_S = 3600  # reuse a found result for an hour (saves agent runs during demos)
_verify_cache: dict[str, tuple[float, dict]] = {}


def verify_goal(doctor_name: str, city: str) -> str:
    parts = doctor_name.split()
    first, last = (" ".join(parts[:-1]), parts[-1]) if len(parts) > 1 else ("", doctor_name)
    return (
        "Use the College of Physicians and Surgeons of Ontario (CPSO) public register on this site to look up "
        f"the doctor named {json.dumps(doctor_name)} practising in or near {json.dumps(city)}, Ontario. "
        f"Go straight to the search form on this page: type {json.dumps(last)} in the Last Name field"
        + (f" and {json.dumps(first)} in the First Name field" if first else "")
        + ", then press Search. Don't open other pages, menus or the advanced search unless the quick search can't find them. "
        "Do not log in or create an account. "
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
    if profile and not profile.startswith(PROFILE_PREFIXES):
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


def search_register(first: str, last: str) -> dict | None:
    """Search the CPSO register directly (a few seconds). Returns its JSON {totalcount, results}, or None if the
    register couldn't be reached / answered in an unexpected way (then the TinyFish agent tries instead)."""
    data = {"lastName": last, "cbx-includeinactive": "on"}
    if first:
        data["firstName"] = first
    try:
        r = httpx.post(SEARCH_URL, data=data, timeout=25, headers={"User-Agent": "CareScout (doctor verification)"})
        if r.status_code != 200:
            return None
        body = json.loads(r.text)
        return body if isinstance(body, dict) and "results" in body else None
    except Exception as e:
        print(f"[cpso] direct register search failed: {type(e).__name__}: {str(e)[:150]}")
        return None


def from_register(found: dict, doctor_name: str, city: str) -> dict:
    """Turn the register's search results into the response."""
    if found.get("totalcount") == -1:
        return verify_result(False, "not_found", f"Too many doctors match {doctor_name}. Add the full first name, or search {CPSO_URL} directly.")
    results = [r for r in found.get("results") or [] if isinstance(r, dict)]
    if not results:
        return verify_result(False, "not_found", f"No CPSO registration found for {doctor_name}. "
                             f"Check the spelling, try without 'Dr.', or search the register directly: {CPSO_URL}")
    in_city = [r for r in results if (r.get("city") or "").strip().lower() == city.strip().lower()]
    if len(results) == 1:
        doc = results[0]
    elif len(in_city) == 1:
        doc = in_city[0]
    else:
        where = f" in {city}" if in_city else ""
        return verify_result(False, "not_found", f"{len(in_city) or len(results)} doctors named {doctor_name}{where} are on the CPSO "
                             f"register, so CareScout can't tell which one. Search {CPSO_URL} with the full name.")
    number = re.sub(r"\D", "", str(doc.get("cpsonumber") or "")) or None
    status = (str(doc.get("registrationstatus") or "").strip() or None)
    specialty = ", ".join(x.strip() for x in str(doc.get("specialties") or "").split(",") if x.strip()) or None
    place = ", ".join(x for x in (str(doc.get("street1") or "").strip(), str(doc.get("city") or "").strip()) if x)
    notes = f"Found {str(doc.get('name') or doctor_name).strip()} on the CPSO register" + (f", practising at {place}" if place else "") + "."
    verified = is_active_status(status)
    if not verified:
        notes += f" Registration status is '{status}', not active." if status else " The registration status could not be confirmed."
    return verify_result(
        verified, "found", notes, cpso_number=number, registration_status=status, specialty=specialty,
        profile_url=f"{CPSO_URL}physician-info/?cpsonum={number}" if number else None,
    )


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
    # 1) the register's own search: a few seconds, exactly what the register shows
    parts = name.split()
    first, last = (" ".join(parts[:-1]), parts[-1]) if len(parts) > 1 else ("", name)
    found = await asyncio.to_thread(search_register, first, last)
    if found is not None:
        result = from_register(found, name, city)
        if result["lookup_status"] == "found":
            _verify_cache[key] = (time.monotonic(), result)
        return result

    # 2) the register couldn't be searched directly: a TinyFish browser agent looks it up instead (slow)
    config.require_key("TINYFISH_API_KEY")

    def run() -> dict:
        try:
            client = config.tinyfish_client(timeout=config.VERIFY_TIMEOUT + 15)  # keep a reference during the run
            r = client.agent.run(goal=verify_goal(name, city), url=CPSO_URL)
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
