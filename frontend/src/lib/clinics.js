// Small pure helpers for clinic data (no React).

export function isFailedScan(clinic) {
  const notes = clinic?.raw_notes || "";
  return notes.startsWith("scan failed") || notes.startsWith("scan error");
}

/** Effective status for display: a failed scan is "unknown", never "closed". */
export function displayStatus(clinic) {
  return isFailedScan(clinic) ? "unknown" : clinic.status;
}

export const STATUS_STYLE = {
  accepting: { label: "Accepting", pin: "#10b981", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  waitlist: { label: "Waitlist Open", pin: "#f59e0b", badge: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  closed: { label: "Not Accepting", pin: "#ef4444", badge: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  unknown: { label: "Couldn't check", pin: "#94a3b8", badge: "bg-slate-100 text-slate-600 ring-slate-500/20" },
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

export function clinicDomId(url) {
  return "clinic-" + String(url).replace(/[^a-zA-Z0-9]+/g, "-");
}
