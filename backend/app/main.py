"""CareScout API: app setup (auth, CORS, errors, lifespan). Each feature lives in its own module."""
import asyncio
import contextlib
import os
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import time
from collections import deque

from . import config, scanning, discovery, ranking, apply_form, cpso, orchestrator, watch_api, clinics_api, clinic_db, refresh

print("[startup] TINYFISH_API_KEY:", "set" if os.getenv("TINYFISH_API_KEY") else "MISSING")
print("[startup] GEMINI_API_KEY:", "set" if os.getenv("GEMINI_API_KEY") else "MISSING")
print("[startup] API auth (CARESCOUT_API_KEY):", "ON" if config.API_KEY else "off (local dev)")
print("[startup] Public demo mode (PUBLIC_DEMO):", "ON (visitors get saved results only)" if config.PUBLIC_DEMO else "off")


class UTF8JSONResponse(JSONResponse):
    """Declare the charset so clients like PowerShell 5.1 don't decode as Latin-1."""
    media_type = "application/json; charset=utf-8"


class CatchAllMiddleware:
    """Turn any unhandled error into a JSON 500 (instead of a bare traceback page)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def tracking_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception as e:
            # Full details go to the server log only; the client gets a generic message (no internals leaked).
            print(f"[error] {scope.get('path')}: {type(e).__name__}: {e}")
            if started:
                raise
            body = {"detail": "Internal server error. Check the backend logs."}
            await UTF8JSONResponse(body, status_code=500)(scope, receive, send)


def check_api_key(request: Request, x_api_key: str | None = Header(default=None)):
    """Shared-secret auth for /api/*. Off unless CARESCOUT_API_KEY is set in .env."""
    if not config.API_KEY or not request.url.path.startswith("/api/"):
        return
    if not x_api_key or not secrets.compare_digest(x_api_key, config.API_KEY):
        raise HTTPException(status_code=401, detail="Missing or wrong X-API-Key header.")


# ---------- Public demo mode (PUBLIC_DEMO=1): protect API credits on a public deployment ----------

# Endpoints that always start a paid TinyFish agent: off for public visitors.
LIVE_ONLY_PATHS = ("/api/apply", "/api/verify-doctor", "/api/discover", "/api/watch/check", "/api/clinics/refresh", "/api/clinics/seed")
# Endpoints that may call Gemini or write data: allowed, but rate-limited per visitor.
RATE_LIMITED_PATHS = ("/api/rank", "/api/mission/stream", "/api/scan", "/api/scan/stream", "/api/watch", "/api/watch/simulate-opening")
RATE_WINDOW_S = 600
_hits: dict[str, deque] = {}


def client_ip(request: Request) -> str:
    """The visitor's IP (hosts like Railway/Render put it first in X-Forwarded-For)."""
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def public_guard(request: Request):
    if not config.public_restricted(request) or request.method == "OPTIONS":
        return
    path = request.url.path
    if path in LIVE_ONLY_PATHS:
        raise HTTPException(
            status_code=403,
            detail="Live agents are turned off on the public demo to protect API credits. Run CareScout locally to use this.",
        )
    if request.method != "GET" and path in RATE_LIMITED_PATHS:
        now = time.monotonic()
        q = _hits.setdefault(client_ip(request), deque())
        while q and now - q[0] > RATE_WINDOW_S:
            q.popleft()
        if len(q) >= config.PUBLIC_RATE_LIMIT:
            raise HTTPException(status_code=429, detail="Too many requests from this device. Try again in a few minutes.")
        q.append(now)
        if len(_hits) > 10_000:  # don't let the table grow forever
            _hits.clear()


@contextlib.asynccontextmanager
async def lifespan(_app):
    if config.SEED_ON_START:
        try:
            added = clinic_db.seed_if_empty(config.SEED_PATH, config.CACHE_PATH, config.DEFAULT_CLINIC_URLS)
            print(f"[startup] clinic database: {clinic_db.count()} clinics" + (f" ({added} loaded from seed files)" if added else ""))
        except Exception as e:  # a broken seed file must never stop the API
            print(f"[startup] clinic database seeding failed: {type(e).__name__}: {e}")
    tasks = []
    if config.WATCHDOG_INTERVAL_MIN > 0:
        tasks.append(asyncio.create_task(watch_api.watchdog_loop()))
    if config.REFRESH_INTERVAL_MIN > 0:
        tasks.append(asyncio.create_task(refresh.refresher_loop()))
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(
    lifespan=lifespan,
    title="CareScout API",
    default_response_class=UTF8JSONResponse,
    dependencies=[Depends(check_api_key), Depends(public_guard)],
    docs_url=None if config.DISABLE_DOCS else "/docs",
    redoc_url=None if config.DISABLE_DOCS else "/redoc",
    openapi_url=None if config.DISABLE_DOCS else "/openapi.json",
)

app.add_middleware(CatchAllMiddleware)  # added first = inner, so CORS headers still reach error responses
app.add_middleware(
    CORSMiddleware,
    # Only local frontends (any port on localhost / 127.0.0.1), anything listed in ALLOWED_ORIGINS, and anything
    # matching ALLOWED_ORIGIN_REGEX (e.g. Vercel preview URLs). A random website can't call the API.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?" + (f"|{config.ALLOWED_ORIGIN_REGEX}" if config.ALLOWED_ORIGIN_REGEX else ""),
    allow_origins=config.EXTRA_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "X-Admin-Key"],
)


@app.get("/health")
def health(request: Request):
    # public_demo tells the website to show saved results only (live agents unlock with the admin key)
    # email_alerts tells the apps whether opening alerts also go out by email
    return {"status": "ok", "public_demo": config.public_restricted(request), "email_alerts": config.email_alerts_enabled()}


app.include_router(scanning.router)
app.include_router(discovery.router)
app.include_router(ranking.router)
app.include_router(apply_form.router)
app.include_router(cpso.router)
app.include_router(orchestrator.router)
app.include_router(watch_api.router)
app.include_router(clinics_api.router)
