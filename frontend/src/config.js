// The one place to change backend settings. Override without editing code by creating
// frontend/.env.local with e.g.  VITE_API_URL=http://localhost:8000  (and VITE_API_KEY=... if the
// backend has CARESCOUT_API_KEY set).
// A value without "https://" (e.g. "my-api.up.railway.app") would otherwise be treated as a path on the website itself,
// so every API call would hit the website instead of the backend (POST -> 405). Add the scheme if it's missing.
export function normalizeApiUrl(raw) {
  let url = String(raw || "http://localhost:8000").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) url = (/^(localhost|127\.0\.0\.1)(:|$)/.test(url) ? "http://" : "https://") + url;
  return url;
}
export const API_BASE_URL = normalizeApiUrl(import.meta.env.VITE_API_URL);
export const API_KEY = import.meta.env.VITE_API_KEY || "";

export const DEFAULT_SEARCH = {
  city: "London, ON",
  postalCode: "N6A 3K7",
  coverage: "OHIP",
  language: "English",
  email: "",
  useCache: false,
  maxClinics: 5, // how many clinics one search includes (1-25)
  recheckAll: false, // true: re-check every clinic live, even ones checked recently
};

export const MAX_CLINICS = 25;

export const COVERAGE_OPTIONS = ["OHIP", "UHIP", "Uninsured"];
export const LANGUAGE_OPTIONS = ["English", "French", "Arabic", "Mandarin", "Punjabi"];

// Default map view (downtown London, ON) until clinics with coordinates arrive.
export const DEFAULT_MAP_CENTER = [42.9849, -81.2453];
