import type { MissionRequest } from "./types";
import { Platform } from "react-native";

// Same idea as frontend/src/config.js: one place for backend settings.
// Set EXPO_PUBLIC_API_URL in mobile/.env to override (restart expo with -c after changing it).

// adds http(s):// if someone forgets it, otherwise the URL gets treated like a path
export function normalizeApiUrl(raw: string | undefined): string {
  let url = String(raw || "").trim().replace(/\/+$/, "");
  if (!url) return defaultApiUrl();
  if (!/^https?:\/\//i.test(url)) {
    const local = /^(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.)/.test(url);
    url = (local ? "http://" : "https://") + url;
  }
  return url;
}

// the android emulator can't see "localhost" on the PC, 10.0.2.2 is its alias for it
function defaultApiUrl() {
  return Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";
}

export const API_BASE_URL = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY || "";

export type Search = {
  city: string;
  postalCode: string;
  coverage: string;
  language: string;
  email: string;
  useCache: boolean;
  maxClinics: number;
  recheckAll: boolean;
};

// demo mode is on by default on mobile so testing doesn't burn agent credits
export const DEFAULT_SEARCH: Search = {
  city: "London, ON",
  postalCode: "N6A 3K7",
  coverage: "OHIP",
  language: "English",
  email: "",
  useCache: true,
  maxClinics: 5,
  recheckAll: false,
};

export const MAX_CLINICS = 25;
export const COVERAGE_OPTIONS = ["OHIP", "UHIP", "Uninsured"];
export const LANGUAGE_OPTIONS = ["English", "French", "Arabic", "Mandarin", "Punjabi"];

// downtown London, ON, used until clinics with coordinates come in
export const DEFAULT_MAP_CENTER = { latitude: 42.9849, longitude: -81.2453 };

// the form → the request the backend wants (used by a new search and by "Load more")
export function toMissionRequest(s: Search, publicDemo: boolean): MissionRequest {
  return {
    city: s.city.trim() || "London, ON",
    user_postal_code: s.postalCode.trim() || null,
    preferences: [],
    language: s.language,
    coverage_type: s.coverage,
    user_email: s.email.trim() || null,
    auto_watch_closed: true,
    use_cache: s.useCache || publicDemo, // the public demo only ever serves saved results
    max_clinics: Math.max(1, Math.min(MAX_CLINICS, Number(s.maxClinics) || 5)),
    refresh: s.recheckAll ? "all" : "auto",
  };
}
