"""Mission Control: clinic database -> re-check what's out of date -> Gemini rank -> watchdog, in one live stream:
POST /api/mission/stream."""
import asyncio
import json
import time
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from . import config, common, agents, models, cache, watchdog, scanning, discovery, ranking, clinic_db, refresh

router = APIRouter()


def ago(iso: str | None) -> str:
    """'2026-11-21T10:00:00Z' -> '3 h ago'."""
    checked = clinic_db.parse_iso(iso)
    if not checked:
        return "earlier"
    mins = int((datetime.now(timezone.utc) - checked).total_seconds() // 60)
    if mins < 1:
        return "just now"
    if mins < 60:
        return f"{mins} min ago"
    if mins < 48 * 60:
        return f"{mins // 60} h ago"
    return f"{mins // (24 * 60)} days ago"


def load_replay(city: str) -> dict | None:
    """The recorded real search (backend/demo_mission.json) if it exists and is for this city, else None."""
    if not config.DEMO_REPLAY:
        return None
    try:
        data = json.loads(config.DEMO_REPLAY_PATH.read_text(encoding="utf-8"))
        if clinic_db.city_key(data.get("city", "")) != clinic_db.city_key(city) or not isinstance(data.get("events"), list):
            return None
        if not any(isinstance(e, dict) and (e.get("event") or {}).get("type") == "clinic_scanned" for e in data["events"]):
            return None
        return data
    except Exception:
        return None


async def replay_events(replay: dict, city: str, user_task, clinics: list[dict], counts: dict):
    """Play back the Scout + Browser Swarm part of a real recorded search, sped up. Each clinic gets this visitor's
    distance and an up-to-date expiry, and is collected for the live ranking and watchdog stages that follow."""
    yield common.sse({"type": "replay", "recorded_at": replay.get("recorded_at"), "speed": config.REPLAY_SPEED})
    last_t = 0.0
    for item in replay["events"]:
        ev = (item or {}).get("event") or {}
        if ev.get("type") not in ("stage", "discovered", "agent_status", "clinic_scanned", "error"):
            continue
        t = float(item.get("t") or 0)
        gap, last_t = max(0.0, t - last_t), max(last_t, t)
        if gap:
            await asyncio.sleep(min(gap / max(config.REPLAY_SPEED, 0.1), config.REPLAY_MAX_GAP_S))
        if ev["type"] == "clinic_scanned":
            clinic = await scanning.add_location(dict(ev["clinic"]), city, user_task)
            if not common.is_failed(clinic):
                clinic["expired"] = clinic_db.is_expired(clinic)  # the recording ages like any saved result
                clinic["status_age_days"] = clinic_db.status_age_days(clinic)
            clinics.append(clinic)
            counts["rechecked"] += 1
            ev = {"type": "clinic_scanned", "clinic": clinic}
        yield common.sse(ev)


@router.post("/api/mission/stream")
async def mission_stream(req: models.MissionRequest, request: Request):
    """Flagship: Scout (clinic database, web search only when it needs more) -> re-check out-of-date clinics
    (quick page read, browser agent as fallback) -> Gemini Triage (rank) -> Watchdog enroll.
    Streams SSE events for every stage and ALWAYS ends with a done event, even if a stage fails."""
    if req.user_email and "@" not in req.user_email:
        raise HTTPException(status_code=422, detail="user_email must be a valid email address.")
    city = req.city.strip() or "London, ON"
    limit = max(1, min(req.max_clinics, config.MAX_MISSION_CLINICS))
    refresh_mode = req.refresh if req.refresh in ("auto", "all", "none") else "auto"
    public = config.public_restricted(request)
    saved_only = req.use_cache or public or refresh_mode == "none"

    # Demo searches replay a recording of a real live search when there is one (so the agents' work is visible).
    replay = load_replay(city) if saved_only and refresh_mode != "none" and not (req.clinic_urls and not public) else None
    # Saved-only searches never go live. With nothing saved they fall back to the demo cache; a public visitor gets a 503.
    fallback = None
    if saved_only and not replay and not clinic_db.nearby(city, None, 1, include_unchecked=False):
        fallback = cache.load_cache()
        if not fallback:
            if public:
                raise HTTPException(status_code=503, detail="The demo results aren't available right now. Try again later.")
            print("[mission] nothing saved for this city and no demo cache; running live")
            saved_only = False
    if not saved_only:
        config.require_key("TINYFISH_API_KEY")  # fail with a JSON 500 before the stream starts
    # Own URLs are a live feature: the public demo ignores them (they'd be stored in the shared clinic database).
    custom_urls, _ = scanning.pick_urls(models.ScanRequest(clinic_urls=req.clinic_urls)) if req.clinic_urls and not public else ([], False)
    # Public demo: only the shared demo account gets auto-watches (no real emails stored, no one else's alerts).
    watch_email = (req.user_email or "").strip() or None
    if public and watch_email and watch_email.lower() != config.DEMO_EMAIL:
        watch_email = None
    started_at = time.monotonic()

    async def events():
        clinics: list[dict] = []
        ranked: list[dict] = []
        watched: list[dict] = []
        tasks: list[asyncio.Task] = []
        counts = {"from_database": 0, "rechecked": 0}
        user_task = asyncio.create_task(scanning.user_location(req.user_postal_code))
        agents.search_started()  # background re-checks stop using browser agents until this search ends
        try:
            if replay:
                # ---- Stages 1-2 from a recording of a real live search (demo / public demo) ----
                async for item in replay_events(replay, city, user_task, clinics, counts):
                    yield item
            else:
                # ---- Stage 1: Scout (database first, web search only for more) ----
                yield common.sse({"type": "stage", "stage": "discover", "message": f"Scout Agent looking for clinics in {city}..."})
                urls: list[str] = []
                try:
                    if fallback:
                        urls = [c["url"] for c in fallback["clinics"]][:limit]
                        yield common.sse({"type": "stage", "stage": "discover", "message": "Demo mode: using saved clinic results."})
                    elif custom_urls:
                        urls = custom_urls[:limit]
                        for u in urls:
                            clinic_db.add_url(u, city, source="manual")
                    else:
                        try:
                            user_loc = await asyncio.wait_for(asyncio.shield(user_task), timeout=10)
                        except Exception:
                            user_loc = None
                        rows = clinic_db.nearby(city, user_loc, limit, include_unchecked=not saved_only)
                        if saved_only:
                            yield common.sse({"type": "stage", "stage": "discover",
                                              "message": f"Using saved results for {len(rows)} clinics from the CareScout database."})
                        elif len(rows) < limit:
                            yield common.sse({"type": "stage", "stage": "discover", "message":
                                              f"{len(rows)} clinics in the CareScout database; searching the web for more..."})
                            try:
                                want = min(20, limit - len(rows) + 3)
                                task = asyncio.create_task(asyncio.to_thread(discovery.discover, models.DiscoverRequest(city=city, max_results=want)))
                                async for ka in common.wait_with_keepalive(task):
                                    yield ka
                                new = sum(clinic_db.add_url(u, city) for u in task.result()["clinic_urls"])
                                if new:
                                    yield common.sse({"type": "stage", "stage": "discover", "message": f"Added {new} new clinic websites to the database."})
                            except Exception as e:
                                yield common.sse({"type": "error", "stage": "discover", "message": f"Web search failed: {getattr(e, 'detail', None) or e}"})
                            if city.lower().startswith("london"):
                                for u in config.DEFAULT_CLINIC_URLS:
                                    clinic_db.add_url(u, city, source="seed")
                            rows = clinic_db.nearby(city, user_loc, limit, include_unchecked=True)
                        else:
                            yield common.sse({"type": "stage", "stage": "discover", "message": f"Found {len(rows)} clinics in the CareScout database."})
                        urls = [r["url"] for r in rows]
                except Exception as e:
                    yield common.sse({"type": "error", "stage": "discover", "message": f"Clinic search failed: {getattr(e, 'detail', None) or e}"})
                yield common.sse({"type": "discovered", "urls": urls})

                # ---- Stage 2: re-check only what's out of date ----
                rows_by_url = {u: clinic_db.get(u) for u in urls}
                if fallback:
                    fresh, stale = [], []
                elif saved_only:
                    fresh, stale = [u for u in urls if (rows_by_url[u] or {}).get("status")], []
                else:
                    fresh = [u for u in urls if refresh_mode == "auto" and clinic_db.is_fresh(rows_by_url[u], config.FRESH_HOURS)]
                    stale = [u for u in urls if u not in fresh]
                if fallback or saved_only:
                    msg = f"Showing {len(urls)} saved clinics."
                elif not stale:
                    msg = f"All {len(fresh)} clinics were checked in the last {config.FRESH_HOURS:g} hours: no re-check needed."
                else:
                    msg = (f"{len(fresh)} clinics are up to date; checking {len(stale)} clinic websites..." if fresh
                           else f"Checking {len(stale)} clinic websites...")
                yield common.sse({"type": "stage", "stage": "scan", "message": msg})

                if fallback:
                    for c in fallback["clinics"][:limit]:
                        clinic = await scanning.add_location({**c, "last_checked": None, "checked_via": "saved"}, city, user_task)
                        clinics.append(clinic)
                        counts["from_database"] += 1
                        yield common.sse({"type": "clinic_scanned", "clinic": clinic})
                for u in fresh:
                    row = rows_by_url[u]
                    yield common.sse({"type": "agent_status", "url": u, "message": f"Up to date (checked {ago(row.get('last_checked'))})"})
                    clinic = await refresh.locate_and_store(clinic_db.to_clinic(row), city, user_task)
                    clinics.append(clinic)
                    counts["from_database"] += 1
                    yield common.sse({"type": "clinic_scanned", "clinic": clinic})

                if stale:
                    queue: asyncio.Queue = asyncio.Queue()

                    async def worker(url: str):
                        async def progress(message: str):
                            await queue.put({"type": "agent_status", "url": url, "message": message})

                        try:
                            result = await refresh.check_url(url, city, allow_agent=True, force=refresh_mode == "all", on_progress=progress)
                            clinic = result["clinic"]
                        except Exception as e:
                            clinic = common.failed_clinic(url, f"scan error: {e}")
                        clinic = await refresh.locate_and_store(clinic, city, user_task)
                        await queue.put({"type": "clinic_scanned", "clinic": clinic})

                    tasks = [asyncio.create_task(worker(u)) for u in stale]
                    done = 0
                    while done < len(stale):
                        try:
                            event = await asyncio.wait_for(queue.get(), timeout=15)
                        except asyncio.TimeoutError:
                            yield common.KEEPALIVE
                            continue
                        if event["type"] == "clinic_scanned":
                            done += 1
                            clinics.append(event["clinic"])
                            counts["rechecked"] += 1
                        yield common.sse(event)
                    await asyncio.gather(*tasks, return_exceptions=True)
                    if set(urls) == set(config.DEFAULT_CLINIC_URLS):
                        cache.save_cache(clinics)  # keep the offline demo backup current

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
            if req.auto_watch_closed and watch_email:
                yield common.sse({"type": "stage", "stage": "watch", "message": "Watchdog enrolling full clinics for opening alerts..."})
                try:
                    for c in clinics:
                        if c["status"] == "closed" and not common.is_failed(c) and not c.get("expired"):  # only confirmed "closed"
                            watched.append(watchdog.add_watch(c["name"], c["url"], "closed", watch_email))
                except Exception as e:
                    yield common.sse({"type": "error", "stage": "watch", "message": f"Watchdog enroll failed: {e}"})
                yield common.sse({"type": "watched", "count": len(watched), "clinics": watched})
            else:
                reason = ("auto_watch_closed is off" if not req.auto_watch_closed
                          else "watchlists use the demo account on the public demo" if req.user_email else "no user_email given")
                yield common.sse({"type": "stage", "stage": "watch", "message": f"Watchdog skipped ({reason})."})
        except Exception as e:  # never end without a done event
            yield common.sse({"type": "error", "stage": "mission", "message": f"Mission error: {e}"})
        finally:
            agents.search_finished()
            for t in [*tasks, user_task]:
                if not t.done():
                    t.cancel()
        ok = [c for c in clinics if not common.is_failed(c) and not c.get("expired")]  # expired = last-seen, not current
        yield common.sse({"type": "done", "summary": {
            "total_scanned": len(clinics),
            "accepting_count": sum(c["status"] == "accepting" for c in ok),
            "waitlist_count": sum(c["status"] == "waitlist" for c in ok),
            "closed_count": sum(c["status"] == "closed" for c in ok),
            "failed_count": sum(common.is_failed(c) for c in clinics),
            "watched_count": len(watched),
            "ranked": bool(ranked),
            "top_clinic": ranked[0]["name"] if ranked else None,
            "duration_s": round(time.monotonic() - started_at, 1),
            "expired_count": sum(bool(c.get("expired")) and not common.is_failed(c) for c in clinics),
            "from_database": counts["from_database"],
            "rechecked": counts["rechecked"],
            "replay_recorded_at": replay.get("recorded_at") if replay else None,
        }})

    return StreamingResponse(
        events(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
