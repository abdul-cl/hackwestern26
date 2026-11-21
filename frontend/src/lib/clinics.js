// Small pure helpers for clinic data (no React).

export function isFailedScan(clinic) {
  const notes = clinic?.raw_notes || "";
  return notes.startsWith("scan failed") || notes.startsWith("scan error");
}

/** Effective status for display: a failed scan is "unknown" (never "closed"); an old result is "expired"
 * (its status is only what was last seen, so it's never shown as current). */
export function displayStatus(clinic) {
  if (isFailedScan(clinic)) return "unknown";
  if (clinic.expired) return "expired";
  return clinic.status;
}

export const STATUS_STYLE = {
  accepting: { label: "Accepting", pin: "#10b981", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  waitlist: { label: "Waitlist Open", pin: "#f59e0b", badge: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  closed: { label: "Not Accepting", pin: "#ef4444", badge: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  unknown: { label: "Couldn't check", pin: "#94a3b8", badge: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  expired: { label: "Needs a re-check", pin: "#a8a29e", badge: "bg-stone-100 text-stone-700 ring-stone-500/20" },
};

/**
 * Merge scan results with ranking results into the list the UI shows.
 * scanned: { [url]: Clinic }, ranked: RankedClinic[] | null (joined on url, falling back to name).
 * Ranked clinics come first, best score first; anything not ranked follows in arrival order.
 */
export function mergeClinics(scanned, order, ranked) {
  const byUrl = scanned;
  const used = new Set();
  const out = [];
  for (const r of ranked || []) {
    const clinic =
      (r.url && byUrl[r.url]) || Object.values(byUrl).find((c) => c.name.trim().toLowerCase() === r.name.trim().toLowerCase());
    if (clinic) used.add(clinic.url);
    out.push({ ...(clinic || { url: r.url || r.name, status: "closed", raw_notes: "" }), ...r, url: clinic?.url || r.url || r.name, ranked: true });
  }
  for (const url of order) {
    if (!used.has(url) && byUrl[url]) out.push({ ...byUrl[url], ranked: false });
  }
  return out;
}

/**
 * Link to the clinic's page that scrolls to and highlights the quoted sentence (a "text fragment", supported by
 * Chrome, Edge and Safari; other browsers just open the page). Uses the quote's first and last few words, so small
 * differences in the middle (spacing, punctuation) don't break the match.
 */
export function quoteLink(url, quote) {
  const words = String(quote || "").replace(/[“”"]/g, "").trim().split(/\s+/).filter(Boolean);
  if (!url || words.length < 3) return url;
  const enc = (s) => encodeURIComponent(s).replace(/-/g, "%2D").replace(/,/g, "%2C");
  const text = words.length <= 10 ? enc(words.join(" ")) : `${enc(words.slice(0, 5).join(" "))},${enc(words.slice(-5).join(" "))}`;
  const base = String(url).split("#")[0];
  return `${base}#:~:text=${text}`;
}

export function clinicDomId(url) {
  return "clinic-" + String(url).replace(/[^a-zA-Z0-9]+/g, "-");
}

/** "Checked 3 h ago · quick read" for a clinic's freshness line (null when we don't know). */
export function checkedLabel(clinic) {
  const via = { page: "read from the clinic's website", agent: "checked by a browser agent", saved: "saved result" }[clinic?.checked_via];
  if (!clinic?.last_checked) return via === "saved result" ? "Saved result" : null;
  const mins = Math.round((Date.now() - new Date(clinic.last_checked).getTime()) / 60000);
  const when = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 48 * 60 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
  return `Checked ${when}` + (via && via !== "saved result" ? `, ${via}` : "");
}

/** "Last seen: Accepting, 10 days ago" for clinics whose availability has expired (null otherwise). */
export function lastSeenLabel(clinic) {
  if (!clinic?.expired || isFailedScan(clinic)) return null;
  const label = STATUS_STYLE[clinic.status]?.label || clinic.status;
  const days = clinic.status_age_days;
  return `Last seen: ${label}${days != null ? `, ${Math.round(days)} days ago` : ""}. Re-check before you rely on it.`;
}
