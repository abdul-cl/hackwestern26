"""Email opening alerts (Resend, https://resend.com). Off unless RESEND_API_KEY is set.

Called by watchdog.save_alerts for REAL alerts only (never previews). One email per alert, to the watch's own email.
Sent on a background thread so a slow mail service never holds up a search or a watch check; failures are logged,
never raised. Test / demo addresses are skipped.
"""
import html
import threading

import httpx

from . import config

RESEND_URL = "https://api.resend.com/emails"
SKIP_DOMAINS = ("example.com", "example.org", "example.net", "carescout.ca")  # carescout.ca = the shared demo account
SKIP_TLDS = (".test", ".invalid", ".example", ".localhost")


def enabled() -> bool:
    return bool(config.RESEND_API_KEY)


def deliverable(email: str) -> bool:
    e = (email or "").strip().lower()
    if "@" not in e or e == config.DEMO_EMAIL:
        return False
    domain = e.rsplit("@", 1)[1]
    return not (domain in SKIP_DOMAINS or domain.endswith(SKIP_TLDS))


def build_email(alert: dict) -> dict:
    """Subject + plain text + simple HTML for one alert."""
    name = alert["clinic_name"]
    opened = alert["new_status"] in ("accepting", "waitlist")
    subject = (f"{name} is now accepting new patients" if alert["new_status"] == "accepting"
               else f"{name} now has an open waitlist" if alert["new_status"] == "waitlist"
               else f"Update: {name} changed status")
    quote = (alert.get("evidence_quote") or "").strip()
    site = config.SITE_URL.rstrip("/")
    lines = [alert["message"], ""]
    if quote:
        lines += [f'What their website says: "{quote}"', ""]
    lines += [f"Clinic website: {alert['url']}", ""]
    if opened:
        lines += ["Spots usually fill quickly, so it's worth calling or applying today.", ""]
    lines += ["You're getting this because you asked CareScout to watch this clinic."]
    if site:
        lines += [f"To stop watching it, open {site}/watchdog."]
    text = "\n".join(lines)
    esc = html.escape
    body = (
        f"<p style=\"font-size:16px\"><b>{esc(alert['message'])}</b></p>"
        + (f"<p>What their website says:<br><i>&ldquo;{esc(quote)}&rdquo;</i></p>" if quote else "")
        + f"<p><a href=\"{esc(alert['url'])}\">Open the clinic's website</a></p>"
        + ("<p>Spots usually fill quickly, so it's worth calling or applying today.</p>" if opened else "")
        + "<p style=\"color:#64748b;font-size:13px\">You're getting this because you asked CareScout to watch this clinic."
        + (f" <a href=\"{esc(site)}/watchdog\">Stop watching</a>." if site else "")
        + "</p>"
    )
    return {"subject": subject, "text": text, "html": body}


def _post(payload: dict) -> None:
    """The one network call (tests replace it)."""
    r = httpx.post(RESEND_URL, json=payload, timeout=15, headers={"Authorization": f"Bearer {config.RESEND_API_KEY}"})
    if r.status_code >= 300:
        raise RuntimeError(f"Resend answered HTTP {r.status_code}: {r.text[:200]}")


def _send(to: str, message: dict) -> None:
    try:
        _post({"from": config.ALERT_FROM_EMAIL, "to": [to], "subject": message["subject"], "text": message["text"], "html": message["html"]})
        print(f"[notify] emailed an opening alert to {to.split('@')[0][:1]}***@{to.split('@')[-1]}")
    except Exception as e:  # never let email break a check
        print(f"[notify] email failed: {type(e).__name__}: {str(e)[:200]}")


def send_alert(alert: dict, to: str, background: bool = True) -> bool:
    """Email one real alert to `to`. Returns True if a send was started."""
    if not enabled() or not deliverable(to):
        return False
    message = build_email(alert)
    if background:
        threading.Thread(target=_send, args=(to, message), daemon=True).start()
    else:
        _send(to, message)
    return True
