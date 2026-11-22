"""One Gemini JSON call with retries + backup models, used by ranking, page reading and discovery.

Gemini sometimes answers 503 "model is experiencing high demand" or 429 (per-minute quota). Those are temporary,
so we retry the same model once after a short pause, then move on to the backup models
(GEMINI_FALLBACK_MODELS). Any other error (bad key, blocked reply, invalid JSON) is raised straight away.
"""
import logging
import time

import httpx
from google.genai import types

from . import config, common

log = logging.getLogger("carescout.llm")

TRANSIENT_CODES = {429, 500, 502, 503, 504}
TRANSIENT_WORDS = ("unavailable", "high demand", "overloaded", "resource_exhausted", "deadline", "try again later")
RETRY_DELAY_S = 1.5  # pause before retrying the same model (tests set it to 0)


def is_timeout(e: Exception) -> bool:
    return isinstance(e, (httpx.TimeoutException, TimeoutError)) or "timed out" in str(e).lower()


KEY_ERROR_WORDS = ("api key not valid", "api_key_invalid", "reported as leaked", "api key expired", "unauthenticated")


def is_key_error(e: Exception) -> bool:
    """True when Google rejected the GEMINI_API_KEY itself (invalid, deleted, disabled or flagged as leaked)."""
    text = str(e).lower()
    return getattr(e, "code", None) == 401 or any(w in text for w in KEY_ERROR_WORDS)


def is_transient(e: Exception) -> bool:
    """True for errors worth retrying or switching models: overload, rate limit, server error, timeout."""
    if is_timeout(e):
        return True
    if getattr(e, "code", None) in TRANSIENT_CODES:
        return True
    text = str(e).lower()
    return any(w in text for w in TRANSIENT_WORDS)


def model_list() -> list[str]:
    out = []
    for m in [config.GEMINI_MODEL, *config.GEMINI_FALLBACK_MODELS]:
        if m and m not in out:
            out.append(m)
    return out


def generate_json(prompt: str, schema):
    """Ask Gemini for JSON matching `schema` (a pydantic model) and return the parsed object.

    Tries each model in model_list(); per model up to config.GEMINI_RETRIES attempts on temporary errors
    (a timeout skips straight to the next model, since retrying a hanging model just waits again).
    Raises the last error if every model failed.
    """
    client = config.gemini_client()  # keep a reference: a temporary client can be closed mid-request
    last_error: Exception | None = None
    for model in model_list():
        for attempt in range(config.GEMINI_RETRIES):
            try:
                resp = client.models.generate_content(
                    model=model, contents=prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=schema),
                )
            except Exception as e:
                if not is_transient(e):
                    raise
                last_error = e
                log.warning("Gemini %s busy (attempt %d): %s", model, attempt + 1, str(e)[:120])
                if is_timeout(e) or attempt + 1 >= config.GEMINI_RETRIES:
                    break  # next model
                time.sleep(RETRY_DELAY_S * (attempt + 1))
                continue
            if model != config.GEMINI_MODEL:
                log.info("Gemini answered with backup model %s", model)
            return common.parse_gemini(resp, schema)
    raise last_error or RuntimeError("no Gemini model configured")
