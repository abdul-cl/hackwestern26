"""Real opening alerts by email (Resend). Called from watchdog.save_alerts, so every path that finds
an opening (Check all now, the background watchdog, the refresher) sends one.

Only openings (accepting / waitlist) are emailed. Simulated openings are NOT emailed unless
EMAIL_DEMO_ALERTS=1 is set for a stage demo, and then the subject says [Demo].
Sending runs on a small background pool so a slow email never slows down a check, and a big batch
(lots of watchers on one clinic) can't start hundreds of threads or blow through Resend's rate limit."""
import html
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

from . import config

RESEND_URL = "https://api.resend.com/emails"
_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="email")  # Resend's default limit is a few requests/sec


def enabled() -> bool:
    return config.email_alerts_enabled()


def build_email(alert: dict, simulated: bool) -> dict:
    name = alert["clinic_name"]
    opened = "is now accepting new patients" if alert["new_status"] == "accepting" else "now has an open waitlist"
    subject = f"{'[Demo] ' if simulated else ''}{name} {opened}"
    quote = (alert.get("evidence_quote") or "").strip()
    url = alert["url"]
    text = (
        f"Good news: {name} {opened} (it was {alert['old_status']}).\n\n"
        + (f'From the clinic\'s website: "{quote}"\n\n' if quote else "")
        + f"Spots fill quickly, so act soon: {url}\n\n"
        "You're getting this because you asked CareScout to watch this clinic. "
        "Always confirm with the clinic before relying on this. "
        "To stop these emails, stop watching the clinic in CareScout's Watchdog."
        + ("\n\n(This was a simulated opening for a demo.)" if simulated else "")
    )
    e = html.escape
    body = (
        f"<p style='font-size:16px'><strong>{e(name)}</strong> {e(opened)} (it was {e(alert['old_status'])}).</p>"
        + (f"<blockquote style='border-left:3px solid #0F6B58;margin:0;padding:4px 12px;color:#33463F'>"
           f"From the clinic's website: &ldquo;{e(quote)}&rdquo;</blockquote>" if quote else "")
        + f"<p><a href='{e(url, quote=True)}' style='background:#0F6B58;color:#fff;padding:10px 16px;"
          f"border-radius:999px;text-decoration:none;display:inline-block'>Open the clinic's website</a></p>"
        + "<p style='color:#5B6E68;font-size:13px'>You're getting this because you asked CareScout to watch this clinic. "
          "Always confirm with the clinic before relying on this. To stop these emails, stop watching the clinic in "
          "CareScout's Watchdog.</p>"
        + ("<p style='color:#5B6E68;font-size:13px'>This was a simulated opening for a demo.</p>" if simulated else "")
    )
    return {"subject": subject, "text": text, "html": body}


def _send(to_email: str, msg: dict, tries: int = 3) -> None:
    who = to_email[:2] + "***"
    for attempt in range(tries):
        try:
            r = httpx.post(
                RESEND_URL,
                headers={"Authorization": f"Bearer {config.RESEND_API_KEY}"},
                json={"from": config.ALERT_FROM_EMAIL, "to": [to_email], **msg},
                timeout=15,
            )
        except httpx.HTTPError as e:
            print(f"[email] couldn't reach Resend for {who} (try {attempt + 1}): {type(e).__name__}")
            time.sleep(2 ** attempt)
            continue
        if r.status_code == 429 or r.status_code >= 500:
            # rate limited / Resend hiccup: wait and try again
            wait = min(float(r.headers.get("retry-after") or 2 ** attempt), 10)
            time.sleep(wait)
            continue
        if r.status_code >= 300:
            # e.g. free tier without a verified domain only sends to your own account email. retrying won't help
            print(f"[email] Resend refused the alert to {who}: {r.status_code} {r.text[:200]}")
        else:
            print(f"[email] opening alert sent to {who}")
        return
    print(f"[email] gave up on the alert to {who} after {tries} tries")


def send_opening_alerts(alerts: list[dict], raw_emails: dict[int, str], simulated: bool = False) -> int:
    """Emails each opening to the watcher's real address. Returns how many were queued."""
    if not enabled() or (simulated and not config.EMAIL_DEMO_ALERTS):
        return 0
    queued = 0
    for a in alerts:
        if a.get("new_status") not in ("accepting", "waitlist"):
            continue  # only good news is worth an email
        to = (raw_emails.get(a["id"]) or a.get("user_email") or "").strip()
        if "@" not in to or "***" in to:
            continue
        _pool.submit(_send, to, build_email(a, simulated))
        queued += 1
    return queued
