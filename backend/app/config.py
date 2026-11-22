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
# Backup models tried in order when the main one is overloaded (503) / rate-limited (429) / times out (see llm.py).
# 3.5-flash-lite answered fast while 3.1-flash-lite was overloaded; 3.6-flash and 3.5-flash were slow or hung.
GEMINI_FALLBACK_MODELS = [m.strip() for m in os.getenv("GEMINI_FALLBACK_MODELS", "gemini-3.5-flash-lite").split(",") if m.strip()]
GEMINI_RETRIES = max(1, int(os.getenv("GEMINI_RETRIES", "2")))  # attempts per model on a temporary error
SCAN_TIMEOUT = float(os.getenv("SCAN_TIMEOUT_S", "180"))  # seconds per clinic scan (a timed-out agent keeps its slot anyway, so short limits only lose results)
APPLY_TIMEOUT = float(os.getenv("APPLY_TIMEOUT_S", "120"))  # seconds for a form fill
VERIFY_TIMEOUT = float(os.getenv("VERIFY_TIMEOUT_S", "45"))  # seconds for a CPSO registry lookup
GEMINI_TIMEOUT_MS = 60_000
MAX_SCAN_URLS = 20
MAX_AGENTS = max(1, int(os.getenv("TINYFISH_MAX_AGENTS", "2")))  # TinyFish plan limit on concurrent agents


# Security settings (all optional; defaults are safe for local dev)
API_KEY = os.getenv("CARESCOUT_API_KEY", "").strip()  # if set, every /api/* call needs header X-API-Key: <value>
# e.g. deployed frontend URL. Forgiving about quotes, spaces and a trailing "/" (the browser sends the origin without one).
EXTRA_ORIGINS = [o for o in (p.strip().strip("\"'").strip().rstrip("/") for p in os.getenv("ALLOWED_ORIGINS", "").split(",")) if o]
DISABLE_DOCS = os.getenv("DISABLE_DOCS", "").strip().lower() in ("1", "true", "yes")
ALLOWED_ORIGIN_REGEX = os.getenv("ALLOWED_ORIGIN_REGEX", "").strip()  # e.g. https://([a-z0-9-]+-)?carescout\.you\.workers\.dev (preview builds)

# Public deployment: visitors only get saved (cached) results, so strangers can't spend TinyFish/Gemini credits.
PUBLIC_DEMO = os.getenv("PUBLIC_DEMO", "").strip().lower() in ("1", "true", "yes")
ADMIN_KEY = os.getenv("CARESCOUT_ADMIN_KEY", "").strip()  # server-side secret: header X-Admin-Key unlocks live agents
PUBLIC_RATE_LIMIT = int(os.getenv("PUBLIC_RATE_LIMIT", "30"))  # requests per visitor per 10 minutes (public mode)


def is_admin(request) -> bool:
    """True when the request carries the server's admin key (never put this key in the frontend)."""
    import secrets
    key = request.headers.get("x-admin-key", "")
    return bool(ADMIN_KEY) and bool(key) and secrets.compare_digest(key, ADMIN_KEY)


# Auto-Fill on the public demo (it starts a paid browser agent, so it's guarded): only for clinic forms CareScout found,
# at most PUBLIC_APPLY_PER_HOUR per visitor and PUBLIC_APPLY_PER_DAY for the whole site. PUBLIC_APPLY=0 turns it off.
PUBLIC_APPLY = os.getenv("PUBLIC_APPLY", "1").strip().lower() not in ("0", "false", "no")
PUBLIC_APPLY_PER_HOUR = max(0, int(os.getenv("PUBLIC_APPLY_PER_HOUR", "3")))
PUBLIC_APPLY_PER_DAY = max(0, int(os.getenv("PUBLIC_APPLY_PER_DAY", "40")))

# First search of a city with nothing saved yet, on the public demo: CareScout searches the web live (TinyFish search,
# quick page reads, TinyFish browser agents when a site needs one) and saves the results for everyone after. Limited to
# PUBLIC_NEW_CITY_MAX clinics per search and PUBLIC_NEW_CITIES_PER_DAY such searches a day (429 after that).
PUBLIC_NEW_CITY_MAX = max(1, int(os.getenv("PUBLIC_NEW_CITY_MAX", "8")))
# A search that finds fewer saved clinics than asked for has TinyFish look for more. In saved-results mode (demo, public
# demo) that web search runs at most once per city per WEB_SEARCH_COOLDOWN_H hours, so a small city isn't searched again
# on every visit.
WEB_SEARCH_COOLDOWN_H = float(os.getenv("WEB_SEARCH_COOLDOWN_H", "6"))
PUBLIC_NEW_CITIES_PER_DAY = max(0, int(os.getenv("PUBLIC_NEW_CITIES_PER_DAY", "20")))

# The shared demo watchlist. On the public demo, watchlists only work for this address, so visitors can try the
# Watchdog flow without storing their own email, and nobody can add, delete or fake alerts for real people's watches.
DEMO_EMAIL = "demo@carescout.ca"
# Email opening alerts (notify.py, https://resend.com). Off unless RESEND_API_KEY is set. The sender address must be
# on a domain verified in Resend; Resend's test sender (onboarding@resend.dev) only delivers to your own Resend email.
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
ALERT_FROM_EMAIL = os.getenv("ALERT_FROM_EMAIL", "CareScout <onboarding@resend.dev>").strip()
SITE_URL = os.getenv("SITE_URL", "").strip()  # the website's address, for the "stop watching" link in emails
# How many proxies sit in front of the app and append to X-Forwarded-For (Railway/Render: 1). The client's real IP is
# that many entries from the end; anything before it was written by the client and can't be trusted.
TRUSTED_PROXY_HOPS = max(0, int(os.getenv("TRUSTED_PROXY_HOPS", "1")))


def public_restricted(request) -> bool:
    """True when this request must stay in demo mode (public deployment and no admin key)."""
    return PUBLIC_DEMO and not is_admin(request)
DEFAULT_CLINIC_URLS = [
    "https://hamiltonmedclinic.com",
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

# ---------- Clinic database (see clinic_db.py / refresh.py) ----------
# Where clinics.db lives. On Railway/Render point this at a persistent volume (e.g. /data) so it survives redeploys.
DATA_DIR = Path(os.getenv("DATA_DIR") or BACKEND_DIR)
# A recording of one real live search (backend/record_demo.py). Demo / public-demo searches replay its Scout and
# Browser Swarm steps at REPLAY_SPEED x (no gap longer than REPLAY_MAX_GAP_S), then rank and watch live as usual.
DEMO_REPLAY_PATH = BACKEND_DIR / "demo_mission.json"
DEMO_REPLAY = os.getenv("DEMO_REPLAY", "1").strip().lower() not in ("0", "false", "no")
REPLAY_SPEED = float(os.getenv("REPLAY_SPEED", "8"))
REPLAY_MAX_GAP_S = float(os.getenv("REPLAY_MAX_GAP_S", "1.5"))
FRESH_HOURS = float(os.getenv("FRESH_HOURS", "12"))  # a clinic checked within this many hours isn't re-checked in "auto" mode
# Availability older than this is "expired": shown as "Needs a re-check" (with the last-seen status), never as current.
MAX_STATUS_AGE_DAYS = float(os.getenv("MAX_STATUS_AGE_DAYS", "7"))
# A clinic whose website has failed every check for this many days (and at least DEAD_MIN_FAILS times) is hidden from searches.
DEAD_AFTER_DAYS = float(os.getenv("DEAD_AFTER_DAYS", "30"))
DEAD_MIN_FAILS = int(os.getenv("DEAD_MIN_FAILS", "3"))
REFRESH_INTERVAL_MIN = float(os.getenv("REFRESH_INTERVAL_MIN", "0") or 0)  # background re-check of stale clinics; 0 = off
REFRESH_BATCH = int(os.getenv("REFRESH_BATCH", "20"))  # clinics per background run
REFRESH_ALLOW_AGENT = os.getenv("REFRESH_ALLOW_AGENT", "1").strip().lower() not in ("0", "false", "no")  # browser-agent fallback
MAX_MISSION_CLINICS = 25  # most clinics one search may include
FETCH_CONCURRENCY = 4  # quick page reads at once
GEMINI_RPM = float(os.getenv("GEMINI_RPM", "12"))  # Gemini calls per minute for page reading (free tier allows ~15)
