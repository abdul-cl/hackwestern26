// Small helpers for clinic data, ported from frontend/src/lib/clinics.js
import type { Clinic, MergedClinic, RankedClinic } from "./types";

export function isFailedScan(clinic?: Partial<Clinic> | null) {
  const notes = clinic?.raw_notes || "";
  return notes.startsWith("scan failed") || notes.startsWith("scan error");
}

export type DisplayStatus = "accepting" | "waitlist" | "closed" | "unknown" | "expired";

// a failed scan isn't "closed", and an old result shouldn't look current
export function displayStatus(clinic: Partial<Clinic>): DisplayStatus {
  if (isFailedScan(clinic)) return "unknown";
  if (clinic.expired) return "expired";
  return (clinic.status as DisplayStatus) || "unknown";
}

// status colours. dot = map pin + badge dot, bg/text = the badge itself
export const STATUS_STYLE: Record<DisplayStatus, { label: string; dot: string; bg: string; text: string }> = {
  accepting: { label: "Accepting", dot: "#14A06F", bg: "#E4F4EC", text: "#0B5A44" },
  waitlist: { label: "Waitlist open", dot: "#E39B2D", bg: "#FCF1DF", text: "#8A5410" },
  closed: { label: "Not accepting", dot: "#D6404A", bg: "#FDECEC", text: "#9B2730" },
  unknown: { label: "Couldn't check", dot: "#93A39E", bg: "#EEF2F0", text: "#4A5A55" },
  expired: { label: "Needs a re-check", dot: "#A8A29E", bg: "#F3F1EF", text: "#57524D" },
};

// joins scan results with ranking results. ranked ones go first (best score first),
// then anything that hasn't been ranked yet in the order it came in
export function mergeClinics(
  scanned: Record<string, Clinic>,
  order: string[],
  ranked: RankedClinic[] | null,
): MergedClinic[] {
  const used = new Set<string>();
  const out: MergedClinic[] = [];

  for (const r of ranked || []) {
    const clinic =
      (r.url && scanned[r.url]) ||
      Object.values(scanned).find((c) => c.name.trim().toLowerCase() === r.name.trim().toLowerCase());
    if (clinic) used.add(clinic.url);
    const base = clinic || ({ url: r.url || r.name, status: "closed", raw_notes: "" } as Clinic);
    out.push({ ...base, ...r, url: clinic?.url || r.url || r.name, ranked: true });
  }
  for (const url of order) {
    if (!used.has(url) && scanned[url]) out.push({ ...scanned[url], ranked: false });
  }
  return out;
}

export function hostOf(url: string) {
  return String(url).replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
}

// "Checked 3 h ago, read from the clinic's website"
export function checkedLabel(clinic: Partial<Clinic>) {
  const via = { page: "read from the clinic's website", agent: "checked by a browser agent", saved: "saved result" }[
    clinic.checked_via || ("" as never)
  ];
  if (!clinic.last_checked) return via === "saved result" ? "Saved result" : null;
  const mins = Math.round((Date.now() - new Date(clinic.last_checked).getTime()) / 60000);
  const when =
    mins < 1 ? "just now"
    : mins < 60 ? `${mins} min ago`
    : mins < 48 * 60 ? `${Math.round(mins / 60)} h ago`
    : `${Math.round(mins / 1440)} days ago`;
  return `Checked ${when}` + (via && via !== "saved result" ? `, ${via}` : "");
}

export function lastSeenLabel(clinic: Partial<Clinic>) {
  if (!clinic.expired || isFailedScan(clinic)) return null;
  const label = STATUS_STYLE[clinic.status as DisplayStatus]?.label || clinic.status;
  const days = clinic.status_age_days;
  return `Last seen: ${label}${days != null ? `, ${Math.round(days)} days ago` : ""}. Re-check before you rely on it.`;
}

// "519-473-0530 ext. 2197" -> "tel:519-473-0530,2197" (the comma makes the phone pause before the extension)
export function telHref(phone: string) {
  const [main, ext] = phone.split(/\s*(?:ext\.?|extension|x)\s*/i);
  const clean = (s?: string) => (s || "").replace(/[^\d+()-]/g, "");
  return "tel:" + clean(main) + (ext ? "," + clean(ext) : "");
}

export const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "accepting", label: "Accepting" },
  { key: "waitlist", label: "Waitlist open" },
  { key: "closed", label: "Not accepting" },
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

export const matchesStatus = (c: Partial<Clinic>, f: StatusFilter) => f === "all" || displayStatus(c) === f;
