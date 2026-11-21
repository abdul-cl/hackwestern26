"""Clinic Watchdog endpoints + the optional background auto-check (storage is in watchdog.py)."""
import asyncio
import os

from fastapi import APIRouter, HTTPException, Request

from . import config, common, models, watchdog, scanning, clinic_db

router = APIRouter()


async def watchdog_loop():
    """Background 'AI employee' shift: re-check every watched clinic on a timer and store any alerts."""
    print(f"[watchdog] auto-check every {config.WATCHDOG_INTERVAL_MIN:g} min")
    while True:
        await asyncio.sleep(config.WATCHDOG_INTERVAL_MIN * 60)
        try:
            if not os.getenv("TINYFISH_API_KEY"):
                print("[watchdog] skipped: TINYFISH_API_KEY missing")
                continue
            result = await run_watch_check(None)
            print(f"[watchdog] checked {result['checked']}, failed {result['failed']}, alerts {len(result['alerts'])}")
        except asyncio.CancelledError:
            raise
        except Exception as e:  # never let the loop die
            print(f"[watchdog] check failed: {type(e).__name__}: {e}")


def validate_watch(req: models.WatchRequest) -> None:
    if not common.is_http_url(req.url):
        raise HTTPException(status_code=422, detail="url must be a valid http(s) URL.")
    if req.last_status not in config.STATUSES:
        raise HTTPException(status_code=422, detail="last_status must be one of: accepting, waitlist, closed.")
    if "@" not in req.user_email:
        raise HTTPException(status_code=422, detail="user_email must be a valid email address.")


PUBLIC_WATCH_DETAIL = (f"Watchlists are only for the demo account ({config.DEMO_EMAIL}) on the public demo. "
                       "Run CareScout locally to watch clinics with your own email.")


def demo_only(request: Request, email: str | None) -> None:
    """Public demo: watch changes are only allowed for the shared demo email."""
    if config.public_restricted(request) and (email or "").strip().lower() != config.DEMO_EMAIL:
        raise HTTPException(status_code=403, detail=PUBLIC_WATCH_DETAIL)


@router.post("/api/watch")
def add_watch(req: models.WatchRequest, request: Request):
    """Watch a clinic. Watching the same url+email again updates that watch instead of duplicating it."""
    validate_watch(req)
    demo_only(request, req.user_email)
    if config.public_restricted(request) and not clinic_db.get(req.url):
        raise HTTPException(status_code=403, detail="On the public demo you can only watch clinics from the CareScout database.")
    return watchdog.add_watch(req.clinic_name.strip(), req.url.strip(), req.last_status, req.user_email.strip())


@router.get("/api/watch")
def list_watches(request: Request, user_email: str | None = None):
    """Newest first. ?user_email=x returns only that user's watches (full email); without it emails are masked."""
    if user_email:
        demo_only(request, user_email)  # public demo: no looking up a real person's watches by their email
    watches = watchdog.list_watches(user_email)
    if not user_email:
        for w in watches:
            w["user_email"] = watchdog.mask_email(w["user_email"])
    return {"watched_clinics": watches}


async def run_watch_check(user_email: str | None) -> dict:
    """Re-scan watched clinics in parallel (only this user's if user_email is given); save and report changes.
    Shared by POST /api/watch/check and the optional background auto-check."""
    watches = watchdog.list_watches(user_email)
    if not watches:
        return {"checked": 0, "failed": 0, "alerts": []}
    urls = sorted({w["url"] for w in watches})  # scan each distinct url once, even if several people watch it
    scanned = await asyncio.gather(*(scanning.scan_clinic(u) for u in urls))
    by_url = dict(zip(urls, scanned))

    alerts, updates, checked_ids, failed, raw_emails = [], [], [], 0, {}
    for w in watches:
        clinic = by_url[w["url"]]
        if common.is_failed(clinic):
            failed += 1  # keep the old status; don't fire a false alert
            continue
        checked_ids.append(w["id"])
        if clinic["status"] != w["last_status"]:
            updates.append((w["id"], clinic["status"]))
            raw_emails[w["id"]] = w["user_email"]
            alerts.append(watchdog.make_alert(w, clinic["status"], clinic["evidence_quote"], show_email=bool(user_email)))
    watchdog.record_checks(updates, checked_ids)
    watchdog.save_alerts(alerts, raw_emails)
    return {"checked": len(checked_ids), "failed": failed, "alerts": alerts}


@router.post("/api/watch/check")
async def check_watches(user_email: str | None = None):
    """Re-scan watched clinics (only this user's if ?user_email= is given); save and report status changes."""
    if watchdog.list_watches(user_email):
        config.require_key("TINYFISH_API_KEY")
    return await run_watch_check(user_email)


@router.get("/api/watch/alerts")
def list_watch_alerts(request: Request, user_email: str | None = None, limit: int = 20):
    """Alert history (real checks, background checks and simulated openings), newest first."""
    if user_email:
        demo_only(request, user_email)
    alerts = watchdog.list_alerts(user_email, max(1, min(limit, 100)))
    return {"alerts": alerts}


@router.delete("/api/watch/{watch_id}")
def delete_watch(watch_id: int, user_email: str, request: Request):
    """Stop watching a clinic. Requires the owner's ?user_email= (so nobody can delete someone else's watch)."""
    demo_only(request, user_email)
    if not watchdog.delete_watch(watch_id, user_email):
        raise HTTPException(status_code=404, detail=f"No watch {watch_id} for that user_email.")
    return {"deleted": True, "id": watch_id}


@router.post("/api/watch/simulate-opening")
def simulate_opening(request: Request, req: models.SimulateRequest | None = None):
    """DEMO ONLY: a PREVIEW of the alert a watched clinic would trigger if it started taking patients.
    Changes nothing: the watch keeps its real status, nothing is added to the alert history, and the message says
    plainly that it's an example (it's about a real clinic, so it must never read as real news).
    Defaults to the most recently added watch. On the public demo only the demo account's watches."""
    watch_id = req.watch_id if req else None
    if config.public_restricted(request):
        watch = watchdog.get_watch(watch_id, user_email=config.DEMO_EMAIL)
    else:
        watch = watchdog.get_watch(watch_id)
    if not watch:
        detail = f"No watch with id {watch_id}." if watch_id is not None else "No watched clinics yet. Add one with POST /api/watch first."
        raise HTTPException(status_code=404, detail=detail)
    now = watchdog.STATUS_LABELS.get(watch["last_status"], watch["last_status"])
    alert = watchdog.make_alert(watch, "accepting", "", show_email=False)
    alert["message"] = (f"Example alert: this is what you'd get if {watch['clinic_name']} started taking new patients. "
                        f"Right now: {now}.")
    print(f"[watch] alert preview for watch {watch['id']} ({watch['clinic_name']}), nothing changed")
    return {"alert": {**alert, "simulated": True}}
