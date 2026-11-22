"""Record one real live CareScout search for the demo replay (backend/demo_mission.json).

Demo and public-demo searches play back its Scout + Browser Swarm steps (sped up), so judges see the real agent
work: quick page reads, the new-patient links being followed, browser agents taking over when a site needs one.
Ranking and the Watchdog still run live for each visitor.

Usage (backend running locally with both API keys, uses real Gemini/TinyFish credits, takes 1-5 min):
    python backend/record_demo.py                     # 8 London clinics, every one re-checked live
    python backend/record_demo.py --clinics 10 --api http://localhost:8000
Re-record before judging: replayed results age like any saved result (older than MAX_STATUS_AGE_DAYS = "Needs a re-check").
"""
import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

KEEP = ("stage", "discovered", "agent_status", "clinic_scanned", "error")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--city", default="London, ON")
    ap.add_argument("--postal", default="N6A 3K7")
    ap.add_argument("--clinics", type=int, default=8)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "demo_mission.json"))
    args = ap.parse_args()

    body = {"city": args.city, "user_postal_code": args.postal, "max_clinics": args.clinics, "refresh": "all",
            "use_cache": False, "auto_watch_closed": False}
    events, started = [], time.monotonic()
    print(f"Recording a live search of {args.clinics} clinics in {args.city} (every clinic re-checked)...")
    with httpx.stream("POST", f"{args.api.rstrip('/')}/api/mission/stream", json=body, timeout=None) as resp:
        if resp.status_code != 200:
            raise SystemExit(f"backend said HTTP {resp.status_code}: {resp.read().decode(errors='replace')[:300]}")
        for line in resp.iter_lines():
            if not line.startswith("data: "):
                continue
            ev = json.loads(line[6:])
            t = round(time.monotonic() - started, 2)
            print(f"{t:7.1f}s  {ev['type']:15} {ev.get('message') or (ev.get('clinic') or {}).get('name') or ''}")
            if ev["type"] == "stage" and ev.get("stage") == "rank":
                break  # ranking and the watchdog run live for every visitor; only Scout + Browser Swarm are replayed
            if ev["type"] in KEEP:
                if ev["type"] == "clinic_scanned":
                    ev["clinic"]["distance_km"] = None  # per-visitor, recomputed on replay
                ev.pop("live_url", None)  # a browser agent's live view only works while it runs
                events.append({"t": t, "event": ev})

    scanned = [e for e in events if e["event"]["type"] == "clinic_scanned"]
    if not scanned:
        raise SystemExit("No clinics were checked; nothing saved.")
    out = {
        "note": "A real live CareScout search, recorded with backend/record_demo.py. Replayed (sped up) for demo searches.",
        "recorded_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "city": args.city,
        "duration_s": events[-1]["t"],
        "events": events,
    }
    Path(args.out).write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Saved {len(scanned)} clinics, {len(events)} events, {out['duration_s']}s of real work -> {args.out}")


if __name__ == "__main__":
    main()
