"""Find clinic websites for a city (TinyFish search + Gemini filter): POST /api/discover."""
import json
from urllib.parse import urlparse

from fastapi import APIRouter
from google.genai import types

from . import config, common, models

router = APIRouter()
BLOCKED_DOMAINS = (
    "yelp.com", "yelp.ca", "reddit.com", "facebook.com", "fb.com", "instagram.com", "twitter.com", "x.com",
    "tiktok.com", "youtube.com", "ratemds.com", "google.com", "google.ca", "goo.gl", "linkedin.com",
    "wikipedia.org", "yellowpages.ca", "pinterest.com", "healthgrades.com",
)


def clean_urls(urls: list[str], limit: int) -> list[str]:
    """Keep clean https clinic URLs, one per website, no social / directory / map sites."""
    seen, out = set(), []
    for url in urls:
        url = (url or "").strip()
        host = (urlparse(url).hostname or "").lower().removeprefix("www.")
        if not url.startswith("https://") or not host or host in seen:
            continue
        if any(host == d or host.endswith("." + d) for d in BLOCKED_DOMAINS):
            continue
        seen.add(host)
        out.append(url)
    return out[:limit]


def gemini_pick(city: str, candidates: list[dict], limit: int) -> list[str]:
    """Gemini reads the search results and keeps only real family clinics in the city."""
    prompt = (
        f"Search results for family doctors in {city}, Ontario:\n{json.dumps(candidates)}\n\n"
        f"Pick up to {limit} results that are the official website of a family medicine clinic, "
        f"family health team or primary care practice actually located in {city}. "
        "Exclude other cities, hospitals, walk-in-only clinics, specialists, pharmacies and directories. "
        "Return the exact url values from the list, best first."
    )
    resp = config.gemini_client().models.generate_content(
        model=config.GEMINI_MODEL, contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=models.UrlPicks),
    )
    allowed = {c["url"] for c in candidates}
    picked = common.parse_gemini(resp, models.UrlPicks).clinic_urls
    return clean_urls([u for u in picked if u in allowed], limit)


@router.post("/api/discover")
def discover(req: models.DiscoverRequest):
    """TinyFish searches the web, Gemini filters the results (Gemini search grounding has no quota on our key)."""
    city = req.city.strip() or "London, ON"
    limit = max(1, min(req.max_results, 20))
    client = config.tinyfish_client(timeout=30)  # raises a JSON 500 if the key is missing
    urls: list[str] = []
    try:
        found = client.search.query(
            f"family medicine clinic family health team accepting new patients {city} Ontario",
            purpose="find official websites of family doctor clinics",
        )
        keep = set(clean_urls([r.url for r in found.results], 20))
        candidates = [
            {"title": r.title, "url": r.url, "snippet": r.snippet}
            for r in found.results if r.url in keep
        ]
        if candidates:
            try:
                urls = gemini_pick(city, candidates, limit)
            except Exception as e:
                print(f"[discover] Gemini filter failed, using unfiltered results: {str(e)[:150]}")
            urls = urls or [c["url"] for c in candidates][:limit]
    except Exception as e:
        print(f"[discover] search failed: {str(e)[:200]}")
    if not urls and city.lower().startswith("london"):
        urls = config.DEFAULT_CLINIC_URLS[:limit]
    return {"city": city, "clinic_urls": urls}
