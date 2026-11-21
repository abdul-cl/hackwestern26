"""CareScout API: app setup (auth, CORS, errors, lifespan). Each feature lives in its own module."""
import asyncio
import contextlib
import os
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config, scanning, discovery, ranking, apply_form, cpso, orchestrator, watch_api
print("[startup] TINYFISH_API_KEY:", "set" if os.getenv("TINYFISH_API_KEY") else "MISSING")
print("[startup] GEMINI_API_KEY:", "set" if os.getenv("GEMINI_API_KEY") else "MISSING")
print("[startup] API auth (CARESCOUT_API_KEY):", "ON" if config.API_KEY else "off (local dev)")


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


@contextlib.asynccontextmanager
async def lifespan(_app):
    task = asyncio.create_task(watch_api.watchdog_loop()) if config.WATCHDOG_INTERVAL_MIN > 0 else None
    yield
    if task:
        task.cancel()


app = FastAPI(
    lifespan=lifespan,
    title="CareScout API",
    default_response_class=UTF8JSONResponse,
    dependencies=[Depends(check_api_key)],
    docs_url=None if config.DISABLE_DOCS else "/docs",
    redoc_url=None if config.DISABLE_DOCS else "/redoc",
    openapi_url=None if config.DISABLE_DOCS else "/openapi.json",
)

app.add_middleware(CatchAllMiddleware)  # added first = inner, so CORS headers still reach error responses
app.add_middleware(
    CORSMiddleware,
    # Only local frontends (any port on localhost / 127.0.0.1) plus anything listed in ALLOWED_ORIGINS.
    # A random website open in the same browser can no longer call the API.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_origins=config.EXTRA_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(scanning.router)
app.include_router(discovery.router)
app.include_router(ranking.router)
app.include_router(apply_form.router)
app.include_router(cpso.router)
app.include_router(orchestrator.router)
app.include_router(watch_api.router)
