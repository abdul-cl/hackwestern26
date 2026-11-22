"""Gemini Triage: rank, translate and add call scripts / badges: POST /api/rank."""
import json
import re

from fastapi import APIRouter, HTTPException

from . import config, llm, models

router = APIRouter()


@router.post("/api/rank")
def rank(req: models.RankRequest):
    if not req.clinics:
        return {"ranked_clinics": []}
    # what the patient says on the phone: French if they chose French, else English (what clinic staff speak)
    spoken = "French" if req.language.strip().lower() in ("french", "français", "francais") else "English"
    prompt = (
        "You rank Ontario family-doctor clinics for a patient.\n"
        f"Patient preferences: {json.dumps(req.preferences)}\n"
        f"Patient coverage type: {req.coverage_type}\n"
        f"Patient language: {req.language}\n"
        f"Clinics (scan results): {json.dumps(req.clinics)}\n\n"
        "Return every clinic, best first. For each: name (exactly as in the input, never translated), "
        "url (exactly as in the input), "
        "score (integer 0-100; clinics accepting new patients score highest, waitlist middle, closed lowest; "
        f"boost clinics whose notes show they accept {req.coverage_type} patients or offer service in {req.language}; "
        "lower clinics whose notes say they do not accept that coverage type), "
        "reason (one sentence), requirements (list of things the patient needs to join, from the notes; "
        "empty list if none), next_step (one short action the patient should take), "
        "coverage_tags (short badges based only on the clinic's notes, e.g. [\"OHIP\", \"Nurse Practitioner\"], "
        "[\"UHIP Friendly\"], or [\"Check Eligibility\"] when the notes do not say). "
        "phone_number (the clinic's phone number copied from raw_notes or evidence_quote, else null), "
        "call_hours (when to call, e.g. \"Mon-Fri, 8am-4pm\", from the notes, else null), "
        "hours (the clinic's opening hours if the notes state them, short, e.g. \"Mon-Fri 9am-5pm, Sat 10am-2pm\", else null), "
        "wait_note (only if the notes state wait times or busiest / quietest times, a short line in plain words, e.g. "
        "\"Walk-in waits are longest Monday mornings\"; else null. Never estimate or invent a wait time), "
        "call_script (ONLY when the clinic's waitlist_url is null, else null). The receptionist at an Ontario clinic "
        f"speaks {spoken}, so the patient must SAY the lines in {spoken}: write a natural 2-3 sentence phone script in "
        f"{spoken} the patient can read word for word to ask about joining as a new patient, one sentence per line"
        + (f", and right under each sentence a line '(meaning: ...)' with that sentence translated into {req.language} "
           "so the patient understands what they are saying (always on its own line, never in brackets after the sentence)" if req.language != spoken else "")
        + f"; then a blank line, then a heading meaning 'Have ready:' written in {req.language} "
        "(do not leave it in English unless the language is English), then a short "
        f"checklist in {req.language} with one item per line, each starting with '- ', of what to have in hand before dialing "
        f"(such as their {req.coverage_type} card, postal code, date of birth, current medications). "
        "Separate the lines with real line breaks. "
        f"Write reason, requirements, next_step, hours and wait_note naturally in {req.language}. "
        "Keep clinic names, URLs, phone numbers and coverage_tags in English. "
        "Never invent a phone number or hours; use null if the data does not contain them. Use only the given data. "
        "If a clinic has distance_km, that is the straight-line distance from the PATIENT'S HOME (their postal code), "
        "not from downtown or any landmark: prefer closer clinics when other factors are similar, and when you mention it "
        "say it is that far from the patient's home. "
        "If a website is a directory, referral service or list of doctors rather than a clinic the patient can join "
        "directly, give it at most 30, say in reason that it is a directory and not a clinic, and make next_step using it "
        "to find a clinic. "
        "If a clinic's raw_notes starts with 'scan failed' or 'scan error', its website could not be checked: "
        "give it score 10, say in reason that its status could not be checked, and make next_step visiting its website "
        "or calling; never claim it is closed. "
        "If a clinic has expired: true, its status was last confirmed status_age_days days ago and may have changed: "
        "give it at most 40, say in reason when it was last confirmed and that it needs a re-check, make next_step "
        "checking the clinic's website or calling, and never present that status as current."
    )
    config.require_key("GEMINI_API_KEY")  # a missing key is a JSON 500, not a 502
    try:
        ranked = llm.generate_json(prompt, models.RankResponse)  # retries + backup model when Gemini is overloaded
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"rank failed: {str(e)[:300]}")
    clinics = [c.model_dump() for c in ranked.ranked_clinics]
    # Fill url from the input clinics (trust our data, not the model): exact name, then case-insensitive name,
    # then the model's url if it really is one of the input urls.
    input_urls = {str(c.get("url")) for c in req.clinics if c.get("url")}
    by_name = {str(c.get("name")): c.get("url") for c in req.clinics if c.get("name")}
    by_lower = {k.strip().lower(): v for k, v in by_name.items()}
    by_url = {str(c.get("url")): c for c in req.clinics if c.get("url")}
    for c in clinics:
        c["score"] = max(0, min(100, c["score"]))
        c["url"] = by_name.get(c["name"]) or by_lower.get(c["name"].strip().lower()) or (c["url"] if c["url"] in input_urls else None)
        enforce_contact_rules(c, by_url.get(c["url"]) if c["url"] else None)
    return {"ranked_clinics": sorted(clinics, key=lambda c: -c["score"])}


def _digits(text) -> str:
    return re.sub(r"\D", "", str(text or ""))


def enforce_contact_rules(ranked: dict, source: dict | None) -> None:
    """Check the model's contact details against the clinic's own data (don't just trust the prompt):
    - a phone number is kept only if its digits appear in what we read from the clinic's site;
    - a call script only for clinics without an online waitlist that DO list a phone number (a script with no
      number to call, or for a clinic you can apply to online, is just confusing)."""
    source = source or {}
    seen = _digits(" ".join(str(source.get(k) or "") for k in ("raw_notes", "evidence_quote", "address")))
    phone = _digits(ranked.get("phone_number"))
    if len(phone) < 7 or phone[-7:] not in seen:
        ranked["phone_number"] = None
    if source.get("waitlist_url") or not ranked["phone_number"]:
        ranked["call_script"] = None
