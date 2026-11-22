// Things kept on the phone between launches: the last finished search (so results still show
// with no Wi-Fi) and the search form. Plain AsyncStorage, nothing secret goes in here
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_SEARCH, type Search } from "./config";
import type { Clinic, MissionSummary, RankedClinic } from "./types";

const RESULTS_KEY = "carescout_last_results";
const SEARCH_KEY = "carescout_search";

export type SavedResults = {
  savedAt: string; // ISO time the search finished
  search: Search;
  urls: string[];
  scanned: Record<string, Clinic>;
  ranked: RankedClinic[] | null;
  summary: MissionSummary | null;
};

export async function saveResults(r: SavedResults) {
  try {
    await AsyncStorage.setItem(RESULTS_KEY, JSON.stringify(r));
  } catch {
    // storage full or unavailable, not worth bothering the user about
  }
}

export async function loadResults(): Promise<SavedResults | null> {
  try {
    const raw = await AsyncStorage.getItem(RESULTS_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as SavedResults;
    // sanity check in case an older version of the app saved something different
    return r && r.scanned && Array.isArray(r.urls) && r.savedAt ? r : null;
  } catch {
    return null;
  }
}

export async function saveSearch(s: Search) {
  try {
    await AsyncStorage.setItem(SEARCH_KEY, JSON.stringify(s));
  } catch {
    // same as above
  }
}

// merges over the defaults so a newly added field never comes back undefined
export async function loadSearch(): Promise<Search | null> {
  try {
    const raw = await AsyncStorage.getItem(SEARCH_KEY);
    return raw ? { ...DEFAULT_SEARCH, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

// "2 h ago", "yesterday"... for the offline notice
export function savedAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
