// The email this browser watches clinics with, remembered so the Watchdog page still shows your watches (and their
// Stop watching buttons) after a reload. Only this browser keeps it; the search form never fills it in by itself.
const KEY = "carescout_watch_email";

export function savedWatchEmail() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function saveWatchEmail(email) {
  try {
    const e = String(email || "").trim();
    if (e.includes("@")) localStorage.setItem(KEY, e);
    else if (!e) localStorage.removeItem(KEY);
  } catch {
    // private window / storage blocked: it just isn't remembered
  }
}
