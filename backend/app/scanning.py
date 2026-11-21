"""Clinic scanning with TinyFish + geocoding: POST /api/scan and POST /api/scan/stream."""
import asyncio

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from . import config, common, models, cache, agents, geo

router = APIRouter()
GOAL = (
    "Find out if this clinic is accepting new patients. Return JSON with: "
    "name (clinic name), status ('accepting', 'waitlist', or 'closed'), "
    "evidence_quote (exact sentence from the page supporting the status), "
    "waitlist_url (URL of a waitlist/intake form if any, else null), "
    "address (the clinic's street address in Ontario exactly as shown on the page, e.g. "
    "'1151 Richmond St, London, ON N6A 3K7'; null if no address is visible), "
    "raw_notes (a short plain-text summary that includes, when the page says them: "
    "what a patient needs to join (e.g. health card, ID), "
    "the clinic phone number, the hours to call or register, "
    "languages spoken, whether OHIP / UHIP / uninsured patients are accepted, "
    "and whether it is phone-only or has an online form). Only include what the page actually states; never guess."
)


def scan_one(url: str) -> dict:
    """Blocking TinyFish call for one clinic; always returns a contract-shaped dict, never raises."""
    try:
        client = config.tinyfish_client(timeout=config.SCAN_TIMEOUT + 15)
        run = client.agent.run(goal=GOAL, url=url)
        if run.status != "COMPLETED" or not run.result:
            msg = run.error.message if run.error else f"run {run.status}"
            return common.failed_clinic(url, f"scan failed: {msg}")
        r = run.result
        if not isinstance(r, dict):
            return common.failed_clinic(url, "scan failed: unexpected result format")
        status = str(r.get("status") or "").lower()
        return {
            "name": str(r.get("name") or url),
            "url": url,
            "status": status if status in config.STATUSES else "closed",
            "evidence_quote": str(r.get("evidence_quote") or ""),
            "waitlist_url": r.get("waitlist_url") or None,
            "raw_notes": str(r.get("raw_notes") or ""),
            "address": str(r["address"]).strip()[:300] if r.get("address") else None,
            "lat": None, "lng": None, "distance_km": None,  # filled in by add_location()
        }
    except Exception as e:
        return common.failed_clinic(url, f"scan error: {e}")


async def scan_clinic(url: str, on_start=None) -> dict:
    """Scan one clinic with TinyFish (queued behind the agent limit, with a timeout). Never raises (except cancellation)."""
    if not common.is_http_url(url):
        return common.failed_clinic(url, "scan failed: not a valid http(s) URL")
    try:
        return await agents.run_agent(lambda: scan_one(url), config.SCAN_TIMEOUT, on_start)
    except asyncio.TimeoutError:
        return common.failed_clinic(url, f"scan failed: timed out after {config.SCAN_TIMEOUT:.0f}s")
    except Exception as e:
        return common.failed_clinic(url, f"scan error: {e}")


LOCATE_TIMEOUT = 20.0  # max seconds spent geocoding one clinic (lookups are spaced 1s apart)


async def user_location(postal_code: str | None) -> dict | None:
    """Geocode the patient's postal code once per scan. Never raises."""
    if not postal_code:
        return None
    try:
        return await asyncio.wait_for(geo.geocode_postal_code(postal_code), timeout=8)
    except Exception:
        return None


async def add_location(clinic: dict, city: str, user_loc_task: "asyncio.Task | None") -> dict:
    """Attach address / lat / lng / distance_km to a clinic. Fail-safe: on any problem they stay null."""
    clinic = {**clinic}
    for key in ("address", "lat", "lng", "distance_km"):
        clinic.setdefault(key, None)
    clinic["distance_km"] = None  # per-patient value, never reuse one from the cache

    async def lookup():
        if common.is_failed(clinic) or clinic["lat"] is not None:
            return  # nothing to look up, or already located (e.g. from the cache)
        name = clinic["name"] if clinic["name"] and clinic["name"] != clinic["url"] else None
        place = await geo.geocode_clinic(clinic["address"], name, city)
        if place:
            clinic["lat"], clinic["lng"] = round(place["lat"], 6), round(place["lng"], 6)

    try:
        await asyncio.wait_for(lookup(), timeout=LOCATE_TIMEOUT)
    except Exception as e:
        print(f"[geo] could not locate {clinic['url']}: {type(e).__name__}")
    try:
        user_loc = await user_loc_task if user_loc_task else None
        if user_loc and clinic["lat"] is not None and clinic["lng"] is not None:
            clinic["distance_km"] = round(geo.haversine_km(user_loc["lat"], user_loc["lng"], clinic["lat"], clinic["lng"]), 1)
    except Exception:
        pass
    return clinic


def pick_urls(req: models.ScanRequest) -> tuple[list[str], bool]:
    """Return (urls to scan, whether this is the default London list)."""
    urls = list(dict.fromkeys(u.strip() for u in req.clinic_urls if u and u.strip()))
    if len(urls) > config.MAX_SCAN_URLS:
        raise HTTPException(status_code=422, detail=f"Too many clinic_urls (max {config.MAX_SCAN_URLS}).")
    if not urls:
        return list(config.DEFAULT_CLINIC_URLS), True
    return urls, False


@router.post("/api/scan")
async def scan(req: models.ScanRequest, request: Request):
    if config.public_restricted(request):
        req.use_cache = True  # public visitors only get saved results
        if not cache.load_cache():
            raise HTTPException(status_code=503, detail="The demo results aren't available right now. Try again later.")
    urls, is_default = pick_urls(req)
    user_task = asyncio.create_task(user_location(req.user_postal_code))  # runs while clinics are scanned
    if req.use_cache:
        cached = cache.load_cache()
        if cached:
            clinics = await asyncio.gather(*(add_location(c, req.city, user_task) for c in cached["clinics"]))
            return {"clinics": list(clinics)}
        print("[scan] use_cache requested but fallback_cache.json is missing or invalid; scanning live")
    try:
        config.require_key("TINYFISH_API_KEY")
    except HTTPException:
        user_task.cancel()
        raise

    async def scan_and_locate(url: str) -> dict:
        return await add_location(await scan_clinic(url), req.city, user_task)

    clinics = list(await asyncio.gather(*(scan_and_locate(u) for u in urls)))
    if is_default:  # never replace the London backup with a custom / partial scan
        cache.save_cache(clinics)
    return {"clinics": clinics}


@router.post("/api/scan/stream")
async def scan_stream(req: models.ScanRequest, request: Request):
    """Same body as /api/scan; streams SSE events as each clinic finishes. Always ends with a done event."""
    if config.public_restricted(request):
        req.use_cache = True  # public visitors only get saved results
        if not cache.load_cache():
            raise HTTPException(status_code=503, detail="The demo results aren't available right now. Try again later.")
    urls, is_default = pick_urls(req)
    cached = cache.load_cache() if req.use_cache else None
    if req.use_cache and not cached:
        print("[scan/stream] use_cache requested but fallback_cache.json is missing or invalid; scanning live")
    if not cached:
        config.require_key("TINYFISH_API_KEY")  # fail with a JSON 500 before the stream starts

    async def events():
        user_task = asyncio.create_task(user_location(req.user_postal_code))
        if cached:
            try:
                for c in cached["clinics"]:
                    yield common.sse({"type": "clinic_result", "clinic": await add_location(c, req.city, user_task)})
            finally:
                user_task.cancel()
            yield common.sse({"type": "done", "total": len(cached["clinics"])})
            return

        queue: asyncio.Queue = asyncio.Queue()

        async def worker(url: str):
            await queue.put({"type": "status", "url": url, "message": "Queued: waiting for a free agent..."})

            async def started():
                await queue.put({"type": "status", "url": url, "message": "Agent started scanning..."})

            try:
                clinic = await scan_clinic(url, on_start=started)
            except Exception as e:  # scan_clinic shouldn't raise, but never leave the stream waiting
                clinic = common.failed_clinic(url, f"scan error: {e}")
            clinic = await add_location(clinic, req.city, user_task)  # fail-safe, bounded by LOCATE_TIMEOUT
            await queue.put({"type": "clinic_result", "clinic": clinic})

        tasks = [asyncio.create_task(worker(u)) for u in urls]
        results: list[dict] = []
        try:
            while len(results) < len(urls):
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"  # SSE comment so proxies/browsers keep the connection open
                    continue
                if event["type"] == "clinic_result":
                    results.append(event["clinic"])
                yield common.sse(event)
            await asyncio.gather(*tasks, return_exceptions=True)
            if is_default:
                cache.save_cache(results)
        except Exception as e:
            yield common.sse({"type": "status", "url": "", "message": f"stream error: {e}"})
        finally:
            # Client disconnected (or we finished): stop any scans still running.
            for t in [*tasks, user_task]:
                if not t.done():
                    t.cancel()
        yield common.sse({"type": "done", "total": len(results)})

    return StreamingResponse(
        events(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
