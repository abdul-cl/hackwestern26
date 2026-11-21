"""Settings, paths and API clients. Every value can be overridden in .env (see CLAUDE.md)."""
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import HTTPException
from google import genai
from google.genai import types
from tinyfish import TinyFish
BACKEND_DIR = Path(__file__).resolve().parents[1]  # .../backend
ROOT_DIR = BACKEND_DIR.parent  # repo root
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env")  # optional; never overrides values that are already set
CACHE_PATH = BACKEND_DIR / "fallback_cache.json"
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")  # 2.5-flash is closed to new keys; 3.8-flash hangs
SCAN_TIMEOUT = float(os.getenv("SCAN_TIMEOUT_S", "180"))  # seconds per clinic scan (a timed-out agent keeps its slot anyway, so short limits only lose results)
APPLY_TIMEOUT = float(os.getenv("APPLY_TIMEOUT_S", "120"))  # seconds for a form fill
VERIFY_TIMEOUT = float(os.getenv("VERIFY_TIMEOUT_S", "45"))  # seconds for a CPSO registry lookup
GEMINI_TIMEOUT_MS = 60_000
MAX_SCAN_URLS = 20
MAX_AGENTS = max(1, int(os.getenv("TINYFISH_MAX_AGENTS", "2")))  # TinyFish plan limit on concurrent agents


# Security settings (all optional; defaults are safe for local dev)
API_KEY = os.getenv("CARESCOUT_API_KEY", "").strip()  # if set, every /api/* call needs header X-API-Key: <value>
EXTRA_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]  # e.g. deployed frontend URL
DISABLE_DOCS = os.getenv("DISABLE_DOCS", "").strip().lower() in ("1", "true", "yes")
ALLOWED_ORIGIN_REGEX = os.getenv("ALLOWED_ORIGIN_REGEX", "").strip()  # e.g. https://carescout-.*\.vercel\.app (preview deploys)

# Public deployment: visitors only get saved (cached) results, so strangers can't spend TinyFish/Gemini credits.
PUBLIC_DEMO = os.getenv("PUBLIC_DEMO", "").strip().lower() in ("1", "true", "yes")
ADMIN_KEY = os.getenv("CARESCOUT_ADMIN_KEY", "").strip()  # server-side secret: header X-Admin-Key unlocks live agents
PUBLIC_RATE_LIMIT = int(os.getenv("PUBLIC_RATE_LIMIT", "30"))  # requests per visitor per 10 minutes (public mode)


def is_admin(request) -> bool:
    """True when the request carries the server's admin key (never put this key in the frontend)."""
    import secrets
    key = request.headers.get("x-admin-key", "")
    return bool(ADMIN_KEY) and bool(key) and secrets.compare_digest(key, ADMIN_KEY)


def public_restricted(request) -> bool:
    """True when this request must stay in demo mode (public deployment and no admin key)."""
    return PUBLIC_DEMO and not is_admin(request)
DEFAULT_CLINIC_URLS = [
    "https://www.ldam.ca/find-a-doctor",
    "https://thamesvalleyfht.ca/become-a-patient/",
    "https://londonfht.ca/looking-for-a-primary-care-provider-apply-here-now/",
    "https://icaremedicallondon.ca/",
    "https://www.wonderlandsouthmedicalcentre.ca",
]


def require_key(name: str) -> str:
    """Return an API key, or raise a clear JSON 500 if it is missing / still the placeholder."""
    value = os.getenv(name, "").strip()
    if not value or value.lower().startswith("your_"):
        raise HTTPException(status_code=500, detail=f"{name} is missing. Add it to the repo-root .env and restart the server.")
    return value


def tinyfish_client(timeout: float) -> TinyFish:
    return TinyFish(api_key=require_key("TINYFISH_API_KEY"), timeout=timeout)


def gemini_client() -> genai.Client:
    return genai.Client(
        api_key=require_key("GEMINI_API_KEY"),
        http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_MS),
    )


WATCHDOG_INTERVAL_MIN = float(os.getenv("WATCHDOG_INTERVAL_MIN", "0") or 0)  # 0 = off
STATUSES = ("accepting", "waitlist", "closed")
