"""backend/fallback_cache.json: the offline/demo backup of the default London scan."""
import json
import os
import tempfile
from datetime import datetime, timezone
from . import config, common


def valid_clinic(c) -> bool:
    return (
        isinstance(c, dict)
        and isinstance(c.get("name"), str)
        and isinstance(c.get("url"), str)
        and c.get("status") in config.STATUSES
        and isinstance(c.get("evidence_quote"), str)
        and isinstance(c.get("raw_notes"), str)
        and (c.get("waitlist_url") is None or isinstance(c.get("waitlist_url"), str))
    )


def load_cache() -> dict | None:
    """Return the cached scan, or None if it is missing, corrupted or malformed."""
    try:
        data = json.loads(config.CACHE_PATH.read_text(encoding="utf-8"))
        clinics = data["clinics"]
        if isinstance(clinics, list) and clinics and all(valid_clinic(c) for c in clinics):
            return {"clinics": clinics}
    except Exception:
        pass
    return None


def save_cache(clinics: list[dict]) -> None:
    """Update the backup from a live scan of the default list (atomic write).

    Clinics that scanned cleanly replace their old entry; clinics that failed this time keep their previous
    good entry. Saved only if the result has at least as many clinics as the current backup, so a bad scan
    (e.g. Wi-Fi dropping mid-scan) can never shrink or empty it.
    """
    old = load_cache()
    old_by_url = {c["url"]: c for c in (old["clinics"] if old else [])}
    merged = []
    for c in clinics:
        if valid_clinic(c) and not common.is_failed(c):
            merged.append(c)
        elif c.get("url") in old_by_url:
            merged.append(old_by_url[c["url"]])
    if not merged or len(merged) < len(old_by_url):
        return
    clinics = [{**c, "distance_km": None} for c in merged]  # distance is per-patient; keep address/lat/lng
    try:
        fd, tmp = tempfile.mkstemp(dir=config.CACHE_PATH.parent, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"saved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "clinics": clinics}, f, indent=2)
        os.replace(tmp, config.CACHE_PATH)
    except Exception as e:
        print(f"[cache] could not save: {e}")
