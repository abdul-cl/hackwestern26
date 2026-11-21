// Small helpers for the phone-only extras: postal codes from GPS, call-back times, directions, sharing
import { Platform } from "react-native";
import { STATUS_STYLE, displayStatus } from "./clinics";
import type { MergedClinic } from "./types";

// ---------- postal code + city from a reverse geocode ----------

const PROVINCES: Record<string, string> = {
  ontario: "ON", quebec: "QC", "québec": "QC", "british columbia": "BC", alberta: "AB", manitoba: "MB",
  saskatchewan: "SK", "nova scotia": "NS", "new brunswick": "NB", "newfoundland and labrador": "NL",
  "prince edward island": "PE", yukon: "YT", "northwest territories": "NT", nunavut: "NU",
};

// "n6a3k7" -> "N6A 3K7". anything that isn't a full code is returned as-is (the backend ignores partial codes)
export function formatPostal(raw: string | null | undefined) {
  const s = String(raw || "").toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(s) ? `${s.slice(0, 3)} ${s.slice(3)}` : String(raw || "").trim().toUpperCase();
}

export function isFullPostal(raw: string) {
  return /^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(formatPostal(raw));
}

// "London" + "Ontario" -> "London, ON"
export function cityLabel(city?: string | null, region?: string | null) {
  if (!city) return null;
  const r = (region || "").trim();
  const short = PROVINCES[r.toLowerCase()] || (r.length <= 3 ? r.toUpperCase() : r);
  return short ? `${city}, ${short}` : city;
}

// ---------- next time the clinic's phone lines open ----------

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_RE = "\\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\\.?"; // word boundary so "month" doesn't count as Monday

function dayIndex(word: string) {
  return DAY_NAMES.indexOf(word.toLowerCase().slice(0, 3));
}

// which weekdays the hours cover. defaults to Mon-Fri when the text doesn't say
function openDays(text: string): Set<number> {
  const t = text.toLowerCase();
  if (/weekdays?/.test(t)) return new Set([1, 2, 3, 4, 5]);
  if (/daily|every day|7 days/.test(t)) return new Set([0, 1, 2, 3, 4, 5, 6]);

  const range = new RegExp(`${DAY_RE}\\s*(?:-|–|—|to|through|thru)\\s*${DAY_RE}`, "i").exec(t);
  if (range) {
    const a = dayIndex(range[1]);
    const b = dayIndex(range[2]);
    const days = new Set<number>();
    for (let d = a; ; d = (d + 1) % 7) {
      days.add(d);
      if (d === b) break;
    }
    return days;
  }
  const listed = [...t.matchAll(new RegExp(DAY_RE, "gi"))].map((m) => dayIndex(m[1]));
  return listed.length ? new Set(listed) : new Set([1, 2, 3, 4, 5]);
}

// first time mentioned is taken as the opening time. "9-5" -> 9:00, "8:30am" -> 8:30, "1pm" -> 13:00
function openTime(text: string): { h: number; m: number } {
  const match = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i.exec(text.replace(/\b(19|20)\d{2}\b/g, ""));
  if (!match) return { h: 9, m: 0 };
  let h = Number(match[1]);
  const m = Number(match[2] || 0);
  const ampm = (match[3] || "").toLowerCase();
  if (ampm.startsWith("p") && h < 12) h += 12;
  else if (ampm.startsWith("a") && h === 12) h = 0;
  else if (!ampm && h >= 1 && h <= 6) h += 12; // "1-4" with no am/pm almost always means the afternoon
  if (h > 23 || m > 59) return { h: 9, m: 0 };
  return { h, m };
}

export type CallSlot = { date: Date; label: string; guessed: boolean };

// next opening after `now` (plus a few minutes so we never suggest a time that's already started)
export function nextCallSlot(callHours: string | null | undefined, now = new Date()): CallSlot {
  const text = callHours || "";
  const days = openDays(text);
  const { h, m } = openTime(text);
  const soonest = new Date(now.getTime() + 5 * 60000);

  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (days.has(d.getDay()) && d > soonest) {
      const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const day = i === 0 ? "today" : i === 1 ? "tomorrow" : d.toLocaleDateString([], { weekday: "long" });
      return { date: d, label: `${day} at ${time}`, guessed: !callHours };
    }
  }
  // can't really get here, but fall back to tomorrow morning
  const d = new Date(now);
  d.setDate(now.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return { date: d, label: "tomorrow at 9:00 AM", guessed: true };
}

// ---------- directions + sharing ----------

export function canGetDirections(c: MergedClinic) {
  return !!c.address || (typeof c.lat === "number" && typeof c.lng === "number");
}

// Apple Maps on iOS, Google Maps everywhere else. the address works better than raw coordinates for labels
export function directionsUrl(c: MergedClinic) {
  const dest = c.address ? `${c.name}, ${c.address}` : `${c.lat},${c.lng}`;
  const q = encodeURIComponent(dest);
  return Platform.OS === "ios" ? `http://maps.apple.com/?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

// plain text that reads well in a text message or WhatsApp
export function shareText(c: MergedClinic) {
  const status = STATUS_STYLE[displayStatus(c)]?.label || c.status;
  const lines = [
    `${c.name}: ${status}`,
    c.evidence_quote ? `"${c.evidence_quote}"` : null,
    c.next_step ? `Next step: ${c.next_step}` : null,
    c.address,
    c.phone_number ? `Phone: ${c.phone_number}` : null,
    c.waitlist_url || c.url,
    "",
    "Found with CareScout",
  ];
  return lines.filter((l) => l !== null).join("\n");
}
