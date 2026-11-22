"""Clinic database endpoints: list saved clinics instantly, re-check one, add more from a web search."""
import asyncio

from fastapi import APIRouter, HTTPException

from . import config, common, models, clinic_db, refresh, scanning, discovery, geo

router = APIRouter()
_background: set[asyncio.Task] = set()  # keep references so background re-checks aren't garbage-collected


@router.get("/api/clinics")
async def list_clinics(city: str = "London, ON", postal_code: str | None = None, limit: int = 25, include_unchecked: bool = False):
    """Saved clinics for a city, closest first if a postal code is given. Instant: no web requests except the
    postal-code lookup for distances."""
    limit = max(1, min(limit, 200))
    user_loc = await scanning.user_location(postal_code)
    rows = clinic_db.nearby(city, user_loc, limit, include_unchecked=include_unchecked)
    clinics = []
    for row in rows:
        c = clinic_db.to_clinic(row) if row.get("status") else {**common.failed_clinic(row["url"], "scan failed: not checked yet"),
                                                                 "last_checked": None, "checked_via": None}
        if user_loc and c["lat"] is not None and c["lng"] is not None:
            from .geo import haversine_km
            c["distance_km"] = round(haversine_km(user_loc["lat"], user_loc["lng"], c["lat"], c["lng"]), 1)
        clinics.append(c)
    return {"city": city, "clinics": clinics, "stats": clinic_db.stats(config.FRESH_HOURS)}


@router.get("/api/clinics/stats")
def clinic_stats():
    return clinic_db.stats(config.FRESH_HOURS)


@router.post("/api/clinics/refresh")
async def refresh_clinic(req: models.RefreshRequest):
    """Re-check one clinic now (quick page read, browser agent as fallback) and return its updated result."""
    url = req.url.strip()
    if not common.is_http_url(url):
        raise HTTPException(status_code=422, detail="url must be a valid http(s) URL.")
    user_task = asyncio.create_task(scanning.user_location(req.user_postal_code))
    result = await refresh.check_url(url, req.city, allow_agent=True, force=True)
    clinic = await refresh.locate_and_store(result["clinic"], req.city, user_task)
    return {"clinic": clinic, "method": result["method"], "status_changed": result["status_changed"], "error": result["error"]}


@router.get("/api/locate")
async def locate(postal_code: str):
    """Full Ontario postal code -> the patient's city, so the search form can fill it in:
    {"postal_code": "M5V 3L9", "city": "Toronto, ON" | null, "found": bool}. Instant after the first lookup."""
    code = geo.normalize_postal_code(postal_code)
    if not code:
        return {"postal_code": None, "city": None, "found": False}
    place = await scanning.user_location(code)
    return {"postal_code": code, "city": (place or {}).get("city"), "found": bool(place)}


@router.post("/api/clinics/seed")
async def seed_clinics(req: models.SeedRequest):
    """Search the web for more clinics in a city, add the new ones, and re-check them in the background."""
    city = req.city.strip() or "London, ON"
    found = await asyncio.to_thread(discovery.discover, models.DiscoverRequest(city=city, max_results=max(1, min(req.max_new, 20))))
    added = [u for u in found["clinic_urls"] if clinic_db.add_url(u, city)]

    async def check_new():
        for u in added:
            result = await refresh.check_url(u, city, allow_agent=config.REFRESH_ALLOW_AGENT)
            if result["method"] in ("page", "agent"):
                await refresh.locate_and_store(result["clinic"], city)

    if added:
        task = asyncio.create_task(check_new())
        _background.add(task)
        task.add_done_callback(_background.discard)
    return {"city": city, "added": added, "found": found["clinic_urls"], "total": clinic_db.count()}
