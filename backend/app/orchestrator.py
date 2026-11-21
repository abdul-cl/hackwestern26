"""Mission Control: discover -> scan -> rank -> watchdog in one live stream: POST /api/mission/stream."""
import asyncio
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from . import config, common, models, cache, watchdog, scanning, discovery, ranking

router = APIRouter()


@router.post("/api/mission/stream")
async def mission_stream(req: models.MissionRequest):
    """Flagship: Scout (discover) -> Browser Swarm (scan + geocode) -> Triage (Gemini rank) -> Watchdog enroll.
    Streams SSE events for every stage and ALWAYS ends with a done event, even if a stage fails."""
    if req.user_email and "@" not in req.user_email:
        raise HTTPException(status_code=422, detail="user_email must be a valid email address.")
    cached = cache.load_cache() if req.use_cache else None
    if req.use_cache and not cached:
        print("[mission] use_cache requested but fallback_cache.json is missing or invalid; running live")
    if not cached:
        config.require_key("TINYFISH_API_KEY")  # fail with a JSON 500 before the stream starts
    custom_urls, _ = scanning.pick_urls(models.ScanRequest(clinic_urls=req.clinic_urls)) if req.clinic_urls else ([], False)
    city = req.city.strip() or "London, ON"
    started_at = time.monotonic()

    async def events():
        clinics: list[dict] = []
        ranked: list[dict] = []
        watched: list[dict] = []
        tasks: list[asyncio.Task] = []
        user_task = asyncio.create_task(scanning.user_location(req.user_postal_code))
        try:
            # ---- Stage 1: Scout Agent ----
            yield common.sse({"type": "stage", "stage": "discover", "message": f"Scout Agent searching for clinics in {city}..."})
            urls: list[str] = []
            try:
                if cached:
                    urls = [c["url"] for c in cached["clinics"]]
                    yield common.sse({"type": "stage", "stage": "discover", "message": "Offline mode: using saved clinic results."})
                elif custom_urls:
                    urls = custom_urls
                else:
                    limit = max(1, min(req.max_clinics, 10))
                    task = asyncio.create_task(asyncio.to_thread(discovery.discover, models.DiscoverRequest(city=city, max_results=limit)))
                    async for ka in common.wait_with_keepalive(task):
                        yield ka
                    urls = task.result()["clinic_urls"]
            except Exception as e:
                yield common.sse({"type": "error", "stage": "discover", "message": f"Clinic search failed: {getattr(e, 'detail', None) or e}"})
            if not urls and city.lower().startswith("london"):
                urls = list(config.DEFAULT_CLINIC_URLS)  # never leave a London mission empty
            yield common.sse({"type": "discovered", "urls": urls})

            # ---- Stage 2: Browser Swarm ----
            yield common.sse({"type": "stage", "stage": "scan", "message": f"Dispatching TinyFish agents to {len(urls)} clinics..."})
            if cached:
                for c in cached["clinics"]:
                    clinic = await scanning.add_location(c, city, user_task)
                    clinics.append(clinic)
                    yield common.sse({"type": "clinic_scanned", "clinic": clinic})
            elif urls:
                queue: asyncio.Queue = asyncio.Queue()

                async def worker(url: str):
                    await queue.put({"type": "agent_status", "url": url, "message": "Queued: waiting for a free agent..."})

                    async def on_start():
                        await queue.put({"type": "agent_status", "url": url, "message": "Agent started scanning..."})

                    try:
                        clinic = await scanning.scan_clinic(url, on_start=on_start)
                    except Exception as e:
                        clinic = common.failed_clinic(url, f"scan error: {e}")
                    clinic = await scanning.add_location(clinic, city, user_task)
                    await queue.put({"type": "clinic_scanned", "clinic": clinic})

                tasks = [asyncio.create_task(worker(u)) for u in urls]
                while len(clinics) < len(urls):
                    try:
                        event = await asyncio.wait_for(queue.get(), timeout=15)
                    except asyncio.TimeoutError:
                        yield common.KEEPALIVE
                        continue
                    if event["type"] == "clinic_scanned":
                        clinics.append(event["clinic"])
                    yield common.sse(event)
                await asyncio.gather(*tasks, return_exceptions=True)
                if urls == config.DEFAULT_CLINIC_URLS:
                    cache.save_cache(clinics)  # same rule as /api/scan: only a full, clean default scan

            # ---- Stage 3: Triage Agent ----
            yield common.sse({"type": "stage", "stage": "rank", "message": "Gemini Triage Agent ranking & translating results..."})
            if clinics:
                try:
                    rank_req = models.RankRequest(preferences=req.preferences, clinics=clinics, language=req.language, coverage_type=req.coverage_type)
                    task = asyncio.create_task(asyncio.to_thread(ranking.rank, rank_req))
                    async for ka in common.wait_with_keepalive(task):
                        yield ka
                    ranked = task.result()["ranked_clinics"]
                    yield common.sse({"type": "ranked", "ranked_clinics": ranked})
                except Exception as e:
                    yield common.sse({"type": "error", "stage": "rank", "message": f"Ranking failed: {getattr(e, 'detail', None) or e}. Showing unranked scan results."})
            else:
                yield common.sse({"type": "error", "stage": "rank", "message": "No clinics to rank."})

            # ---- Stage 4: Watchdog auto-enroll ----
            if req.auto_watch_closed and req.user_email:
                yield common.sse({"type": "stage", "stage": "watch", "message": "Watchdog enrolling full clinics for opening alerts..."})
                try:
                    for c in clinics:
                        if c["status"] == "closed" and not common.is_failed(c):  # a failed scan isn't really "closed"
                            watched.append(watchdog.add_watch(c["name"], c["url"], "closed", req.user_email.strip()))
                except Exception as e:
                    yield common.sse({"type": "error", "stage": "watch", "message": f"Watchdog enroll failed: {e}"})
                yield common.sse({"type": "watched", "count": len(watched), "clinics": watched})
            else:
                reason = "no user_email given" if not req.user_email else "auto_watch_closed is off"
                yield common.sse({"type": "stage", "stage": "watch", "message": f"Watchdog skipped ({reason})."})
        except Exception as e:  # never end without a done event
            yield common.sse({"type": "error", "stage": "mission", "message": f"Mission error: {e}"})
        finally:
            for t in [*tasks, user_task]:
                if not t.done():
                    t.cancel()
        ok = [c for c in clinics if not common.is_failed(c)]
        yield common.sse({"type": "done", "summary": {
            "total_scanned": len(clinics),
            "accepting_count": sum(c["status"] == "accepting" for c in ok),
            "waitlist_count": sum(c["status"] == "waitlist" for c in ok),
            "closed_count": sum(c["status"] == "closed" for c in ok),
            "failed_count": len(clinics) - len(ok),
            "watched_count": len(watched),
            "ranked": bool(ranked),
            "top_clinic": ranked[0]["name"] if ranked else None,
            "duration_s": round(time.monotonic() - started_at, 1),
        }})

    return StreamingResponse(
        events(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
