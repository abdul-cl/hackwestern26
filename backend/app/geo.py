"""Geocoding (OpenStreetMap Nominatim) + distance helpers. Every function is fail-safe: errors return None."""
import asyncio
import math
import re
import time

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "CareScoutHackathon/1.0"}
TIMEOUT_S = 5.0
MIN_INTERVAL_S = 1.1  # Nominatim usage policy: max 1 request per second

_cache: dict[str, dict | None] = {}  # query -> result (None = Nominatim found nothing)
_last_request = 0.0
_lock: asyncio.Lock | None = None
_lock_loop = None
_down_until = 0.0  # circuit breaker: after a network error, skip lookups for a while (e.g. Wi-Fi dropped)
DOWN_COOLDOWN_S = 30.0

POSTAL_RE = re.compile(r"^\s*([A-Za-z]\d[A-Za-z])\s*-?\s*(\d[A-Za-z]\d)\s*$")


def _get_lock() -> asyncio.Lock:
    """One lock per event loop (so requests are spaced 1s apart without crashing in tests)."""
    global _lock, _lock_loop
    loop = asyncio.get_running_loop()
    if _lock is None or _lock_loop is not loop:
        _lock, _lock_loop = asyncio.Lock(), loop
    return _lock


def normalize_postal_code(code: str | None) -> str | None:
    """'n6a3k7' -> 'N6A 3K7'. Returns None if it isn't a full Canadian postal code."""
    m = POSTAL_RE.match(code or "")
    return f"{m.group(1)} {m.group(2)}".upper() if m else None


async def _search(params: dict, cache_key: str) -> dict | None:
    if cache_key in _cache:
        return _cache[cache_key]
    global _last_request, _down_until
    if time.monotonic() < _down_until:
        return None  # Nominatim was unreachable recently; don't stall the scan
    try:
        async with _get_lock():
            if time.monotonic() < _down_until:
                return None  # breaker tripped while we were queued
            for attempt in range(2):  # one retry, so a single network blip doesn't trip the breaker
                wait = MIN_INTERVAL_S - (time.monotonic() - _last_request)
                if wait > 0:
                    await asyncio.sleep(wait)
                try:
                    async with httpx.AsyncClient(headers=HEADERS, timeout=TIMEOUT_S) as client:
                        resp = await client.get(NOMINATIM_URL, params={
                            **params, "format": "jsonv2", "limit": 1, "countrycodes": "ca", "addressdetails": 1,
                        })
                    break
                except httpx.TransportError:
                    if attempt == 1:
                        raise
                finally:
                    _last_request = time.monotonic()
        resp.raise_for_status()
        hits = resp.json()
        result = None
        if hits:
            hit = hits[0]
            # Only accept places in Ontario, so a same-named place elsewhere never lands on the map.
            if (hit.get("address") or {}).get("state") == "Ontario":
                address = hit.get("address") or {}
                place = next((address.get(k) for k in ("city", "town", "village", "municipality", "hamlet") if address.get(k)), None)
                result = {"lat": float(hit["lat"]), "lng": float(hit["lon"]), "display_name": hit.get("display_name", ""),
                          "city": f"{place}, ON" if place else None}
        _cache[cache_key] = result  # cache real answers (incl. "not found"), never errors/timeouts
        return result
    except Exception as e:
        _down_until = time.monotonic() + DOWN_COOLDOWN_S
        print(f"[geo] lookup failed for {cache_key!r}: {type(e).__name__}: {str(e)[:120]}")
        return None


async def geocode_address(query: str) -> dict | None:
    """Free-text address/place in Ontario -> {"lat", "lng", "display_name"} or None."""
    query = " ".join((query or "").split())[:200]
    if not query:
        return None
    return await _search({"q": query}, "q:" + query.lower())


async def city_for_postal_code(code: str | None) -> str | None:
    """'M5V 3L9' -> 'Toronto, ON' (None if the code isn't a full Ontario postal code or the lookup fails)."""
    place = await geocode_postal_code(code)
    return (place or {}).get("city")


async def geocode_postal_code(code: str | None) -> dict | None:
    """Full Canadian postal code -> {"lat", "lng", "display_name"} or None (partial codes are rejected:
    Nominatim matches 3-character prefixes to random places)."""
    postal = normalize_postal_code(code)
    if not postal:
        return None
    return await _search({"postalcode": postal, "country": "Canada"}, "postal:" + postal)


UNIT_RE = re.compile(r"\s*,?\s*[-–—]?\s*\b(unit|suite|ste|apt|room|rm)\.?\s*#?\s*[\w-]+\s*,?|\s+#\s*[\w-]+", re.IGNORECASE)
POSTAL_IN_TEXT_RE = re.compile(r"\b([A-Za-z]\d[A-Za-z])\s*-?\s*(\d[A-Za-z]\d)\b")


def address_without_unit(address: str) -> str | None:
    """'155 Clarke Road Unit 5 London, ON' -> '155 Clarke Road London, ON' (Nominatim often fails on unit numbers)."""
    cleaned = " ".join(UNIT_RE.sub(" ", address or "").split()).strip(" ,")
    cleaned = re.sub(r"\s+,", ",", cleaned)
    # Canadian "unit-street number" format: '122-747 Hyde Park Road' -> '747 Hyde Park Road'
    cleaned = re.sub(r"^\s*\d+[A-Za-z]?\s*-\s*(\d+)\b", r"\1", cleaned)
    return cleaned if cleaned and cleaned != " ".join((address or "").split()) else None


def postal_code_in(text: str) -> str | None:
    """Find a full Canadian postal code inside an address string."""
    m = POSTAL_IN_TEXT_RE.search(text or "")
    return f"{m.group(1)} {m.group(2)}".upper() if m else None


async def geocode_clinic(address: str | None, name: str | None, city: str) -> dict | None:
    """Best-effort clinic location: full address -> address without unit -> its postal code -> 'name, city'."""
    if address:
        place = await geocode_address(address)
        if place:
            return place
        simpler = address_without_unit(address)
        if simpler:
            place = await geocode_address(simpler)
            if place:
                return place
        postal = postal_code_in(address)
        if postal:
            place = await geocode_postal_code(postal)
            if place:
                return place
    if name:
        return await geocode_address(f"{name}, {city}")
    return None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km."""
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
