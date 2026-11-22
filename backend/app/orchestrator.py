"""Mission Control: clinic database -> re-check what's out of date -> Gemini rank -> watchdog, in one live stream:
POST /api/mission/stream."""
import asyncio
import json
import time
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from . import config, common, agents, geo, models, cache, watchdog, scanning, discovery, ranking, clinic_db, refresh

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


async def replay_events(replay: dict, city: str, user_task, limit: int, clinics: list[dict], counts: dict):
    """Play back the Scout + Browser Swarm part of a real recorded search, sped up, for the `limit` recorded clinics
    closest to this visitor (same rule as a normal search). Each clinic gets this visitor's distance and an up-to-date
    expiry, and is collected for the live ranking and watchdog stages that follow."""
    recorded = {ev["clinic"]["url"]: ev["clinic"] for ev in ((i or {}).get("event") or {} for i in replay["events"])
                if ev.get("type") == "clinic_scanned" and (ev.get("clinic") or {}).get("url")}
    try:
        user_loc = await asyncio.wait_for(asyncio.shield(user_task), timeout=10)
    except Exception:
        user_loc = None

    def distance(c: dict) -> float:
        if user_loc and c.get("lat") is not None and c.get("lng") is not None:
            return geo.haversine_km(user_loc["lat"], user_loc["lng"], c["lat"], c["lng"])
        return float("inf")

    order = list(recorded)
    keep = set(sorted(order, key=lambda u: (distance(recorded[u]), order.index(u)))[:limit])

    plural = "" if len(keep) == 1 else "s"
    yield common.sse({"type": "replay", "recorded_at": replay.get("recorded_at"), "speed": config.REPLAY_SPEED})
    yield common.sse({"type": "stage", "stage": "discover", "message": f"Scout Agent looking for clinics in {city}..."})
    yield common.sse({"type": "stage", "stage": "discover", "message": f"Found {len(keep)} clinic{plural} in the CareScout database."})
    yield common.sse({"type": "discovered", "urls": [u for u in order if u in keep]})
    yield common.sse({"type": "stage", "stage": "scan", "message": f"Checking {len(keep)} clinic website{plural}..."})
    last_t = None
    for item in replay["events"]:
        ev = (item or {}).get("event") or {}
        url = ev.get("url") or (ev.get("clinic") or {}).get("url")
        if ev.get("type") not in ("agent_status", "clinic_scanned") or url not in keep:
            continue  # stage / discovered messages are rewritten above for this visitor's clinics
        t = float(item.get("t") or 0)
        if last_t is not None and t > last_t:
            await asyncio.sleep(min((t - last_t) / max(config.REPLAY_SPEED, 0.1), config.REPLAY_MAX_GAP_S))
        last_t = t if last_t is None else max(last_t, t)
        if ev["type"] == "clinic_scanned":
            clinic = await scanning.add_location(dict(ev["clinic"]), city, user_task)
            if not common.is_failed(clinic):
                clinic["expired"] = clinic_db.is_expired(clinic)  # the recording ages like any saved result
                clinic["status_age_days"] = clinic_db.status_age_days(clinic)
            clinics.append(clinic)
            counts["rechecked"] += 1
            ev = {"type": "clinic_scanned", "clinic": clinic}
        yield common.sse(ev)


_new_city_searches: list[float] = []  # when public new-city searches ran (for PUBLIC_NEW_CITIES_PER_DAY)
_watch_searches: list[float] = []  # when public watch-mode searches ran (for PUBLIC_WATCH_PER_DAY)


def watch_allowed() -> bool:
    now = time.monotonic()
    _watch_searches[:] = [t for t in _watch_searches if now - t < 86_400]
    if len(_watch_searches) >= config.PUBLIC_WATCH_PER_DAY:
        return False
    _watch_searches.append(now)
    return True


def new_city_allowed() -> bool:
    now = time.monotonic()
    _new_city_searches[:] = [t for t in _new_city_searches if now - t < 86_400]
    if len(_new_city_searches) >= config.PUBLIC_NEW_CITIES_PER_DAY:
        return False
    _new_city_searches.append(now)
    return True


async def _value(v):
    return v


def tinyfish_ready() -> bool:
    try:
        config.require_key("TINYFISH_API_KEY")
        return True
    except Exception:
        return False


def web_search_due(city: str) -> bool:
    """Saved-results searches: has this city's web search not run in the last WEB_SEARCH_COOLDOWN_H hours?"""
    last = clinic_db.parse_iso(clinic_db.get_meta("websearch:" + clinic_db.city_key(city)))
    if not last:
        return True
    from datetime import datetime, timezone
    return (datetime.now(timezone.utc) - last).total_seconds() > config.WEB_SEARCH_COOLDOWN_H * 3600


@router.post("/api/mission/stream")
async def mission_stream(req: models.MissionRequest, request: Request):
    """Flagship: Scout (clinic database, web search only when it needs more) -> re-check out-of-date clinics
    (quick page read, browser agent as fallback) -> Gemini Triage (rank) -> Watchdog enroll.
    Streams SSE events for every stage and ALWAYS ends with a done event, even if a stage fails."""
    if req.user_email and "@" not in req.user_email:
        raise HTTPException(status_code=422, detail="user_email must be a valid email address.")
    # The patient's location (and, with no city given, their city) comes from their postal code.
    patient_loc = await scanning.user_location(req.user_postal_code)
    city = req.city.strip() or (patient_loc or {}).get("city") or "London, ON"
    limit = max(1, min(req.max_clinics, config.MAX_MISSION_CLINICS))
    refresh_mode = req.refresh if req.refresh in ("auto", "all", "none") else "auto"
    public = config.public_restricted(request)
    # Watch mode: a TinyFish browser agent reads every clinic in this search (saved ones too), live on screen.
    watch = bool(req.watch_agents)
    if watch and public:
        if not watch_allowed():
            raise HTTPException(status_code=429, detail="Watch mode has reached today's limit on the public demo. Run a normal search, or try again tomorrow.")
        limit = min(limit, config.PUBLIC_WATCH_MAX)
    saved_only = (req.use_cache or public or refresh_mode == "none") and not watch

    # Demo searches replay a recording of a real live search when there is one (so the agents' work is visible).
    replay = load_replay(city) if saved_only and refresh_mode != "none" and not (req.clinic_urls and not public) and not watch else None
    # Saved-only searches (demo mode, public demo) use the clinic database. A city with nothing saved yet is searched
    # live instead: TinyFish finds its clinics and checks them (browser agents when a site needs one), and the results
    # are saved for the next search. The saved London backup (fallback_cache.json) is only ever used for London.
    fallback = None
    new_city = False
    if saved_only and not replay and not clinic_db.nearby(city, None, 1, include_unchecked=False):
        london = clinic_db.city_key(city) == "london"
        fallback = cache.load_cache() if london else None
        if not fallback:
            if public and not new_city_allowed():
                raise HTTPException(status_code=429, detail=f"CareScout hasn't searched {city} yet, and today's limit of new-city searches on the public demo is used up. Try again tomorrow.")
            print(f"[mission] nothing saved for {city}; searching it live")
            saved_only, new_city = False, True
            if public:
                limit = min(limit, config.PUBLIC_NEW_CITY_MAX)
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
        user_task = asyncio.create_task(_value(patient_loc))  # looked up once, before the stream started
        agents.search_started()  # background re-checks stop using browser agents until this search ends
        try:
            if replay:
                # ---- Stages 1-2 from a recording of a real live search (demo / public demo) ----
                async for item in replay_events(replay, city, user_task, limit, clinics, counts):
                    yield item
            else:
                # ---- Stage 1: Scout (database first, web search only for more) ----
                yield common.sse({"type": "stage", "stage": "discover", "message": f"Scout Agent looking for clinics in {city}..."})
                if watch:
                    yield common.sse({"type": "stage", "stage": "discover", "message":
                                      "Watch mode: a TinyFish browser agent will open each clinic's website (2 at a time) and you can watch it work."})
                if new_city:
                    yield common.sse({"type": "stage", "stage": "discover", "message":
                                      f"CareScout hasn't searched {city} before: TinyFish is searching the web for its clinics and will check each one live (this first search takes a minute or two; the results are saved for next time)."})
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
                        # Fewer clinics saved than asked for: TinyFish looks for more and the new ones are checked live
                        # (saved-results mode too, at most once per city per WEB_SEARCH_COOLDOWN_H, within the public
                        # daily limit). Every search adds what the database doesn't have yet.
                        top_up = len(rows) < limit and (not saved_only or (
                            tinyfish_ready() and web_search_due(city) and (not public or new_city_allowed())))
                        if saved_only and not top_up:
                            yield common.sse({"type": "stage", "stage": "discover",
                                              "message": f"Using saved results for {len(rows)} clinics from the CareScout database."})
                        elif top_up:
                            yield common.sse({"type": "stage", "stage": "discover", "message":
                                              f"{len(rows)} clinics in the CareScout database; TinyFish is searching the web for more..."})
                            try:
                                want = min(20, limit - len(rows) + 3)
                                task = asyncio.create_task(asyncio.to_thread(discovery.discover, models.DiscoverRequest(city=city, max_results=want)))
                                async for ka in common.wait_with_keepalive(task):
                                    yield ka
                                new = sum(clinic_db.add_url(u, city) for u in task.result()["clinic_urls"])
                                clinic_db.set_meta("websearch:" + clinic_db.city_key(city), clinic_db.now_iso())
                                if new:
                                    yield common.sse({"type": "stage", "stage": "discover", "message": f"Added {new} new clinic websites to the database."})
                            except Exception as e:
                                yield common.sse({"type": "error", "stage": "discover", "message": f"Web search failed: {getattr(e, 'detail', None) or e}"})
                            if city.lower().startswith("london"):
                                for u in config.DEFAULT_CLINIC_URLS:
                                    clinic_db.add_url(u, city, source="seed")
                            rows = clinic_db.nearby(city, user_loc, limit, include_unchecked=True)
                            if public:  # visitors: at most PUBLIC_NEW_CITY_MAX not-yet-checked clinics per search
                                fresh_rows = [r for r in rows if r.get("status")]
                                rows = fresh_rows + [r for r in rows if not r.get("status")][: config.PUBLIC_NEW_CITY_MAX]
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
                elif saved_only:  # saved clinics as they are; clinics just found by the web search get checked live
                    fresh = [u for u in urls if (rows_by_url[u] or {}).get("status")]
                    stale = [u for u in urls if u not in fresh]
                else:
                    fresh = [u for u in urls if refresh_mode == "auto" and not watch and clinic_db.is_fresh(rows_by_url[u], config.FRESH_HOURS)]
                    stale = [u for u in urls if u not in fresh]
                if fallback or (saved_only and not stale):
                    msg = f"Showing {len(urls)} saved clinics."
                elif saved_only:
                    msg = f"Showing {len(fresh)} saved clinics; checking {len(stale)} new clinic websites live..."
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
                        async def progress(message: str, live_url: str | None = None):
                            event = {"type": "agent_status", "url": url, "message": message}
                            if live_url:
                                event["live_url"] = live_url  # the browser agent's live view (watchable while it runs)
                            await queue.put(event)

                        try:
                            result = await refresh.check_url(url, city, allow_agent=True, force=refresh_mode == "all" or watch,
                                                             on_progress=progress, agent_only=watch)
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
