// State every tab shares: the search form, the running mission (so a search keeps going
// if you switch tabs), the opening alert banner, the watch count and the owner key
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, setAdminKey } from "@/lib/api";
import { DEFAULT_SEARCH, MAX_CLINICS, type Search } from "@/lib/config";
import { loadResults, loadSearch, saveResults, saveSearch, type SavedResults } from "@/lib/storage";
import type { WatchAlert } from "@/lib/types";
import { useMission, type Mission } from "@/hooks/useMission";

const ADMIN_KEY_STORAGE = "carescout_admin_key";

type AppState = {
  search: Search;
  setSearch: React.Dispatch<React.SetStateAction<Search>>;
  mission: Mission;
  launch: (overrides?: Partial<Search>) => void;
  publicDemo: boolean;
  backendUp: boolean | null; // null until the first health check comes back
  alert: WatchAlert | null;
  setAlert: (a: WatchAlert | null) => void;
  watchCount: number;
  setWatchCount: (n: number) => void;
  refreshWatchCount: () => void;
  ownerKey: string;
  saveOwnerKey: (key: string) => Promise<void>;
  savedAt: string | null; // when the last finished search was saved on this phone
  showSaved: () => void; // put those saved results back on screen (used when offline)
};

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState<Search>(DEFAULT_SEARCH);
  const mission = useMission();
  const [publicDemo, setPublicDemo] = useState(false);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [alert, setAlert] = useState<WatchAlert | null>(null);
  const [watchCount, setWatchCount] = useState(0);
  const [ownerKey, setOwnerKey] = useState("");
  const email = search.email.trim();

  // asks the backend if it's the public demo. with a valid owner key it answers "no", same as the website
  const checkHealth = useCallback(async () => {
    try {
      const h = await api.health();
      setBackendUp(true);
      setPublicDemo(!!h.public_demo);
      if (h.public_demo) setSearch((s) => ({ ...s, useCache: true }));
    } catch {
      setBackendUp(false);
    }
  }, []);

  // load the owner key (if any) first so the health check already sends it
  useEffect(() => {
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem(ADMIN_KEY_STORAGE)) || "";
        if (saved) {
          setAdminKey(saved);
          setOwnerKey(saved);
        }
      } catch {
        // storage not available, just run without it
      }
      checkHealth();
    })();
  }, [checkHealth]);

  const saveOwnerKey = useCallback(
    async (key: string) => {
      const k = key.trim();
      setAdminKey(k);
      setOwnerKey(k);
      try {
        if (k) await AsyncStorage.setItem(ADMIN_KEY_STORAGE, k);
        else await AsyncStorage.removeItem(ADMIN_KEY_STORAGE);
      } catch {
        // fine, it still works until the app closes
      }
      await checkHealth();
    },
    [checkHealth],
  );

  // ---------- offline: remember the form and the last finished search ----------
  const [saved, setSaved] = useState<SavedResults | null>(null);
  const loaded = useRef(false);
  const { restore } = mission;
  // true once a live search has started, so the saved results never replace it
  const liveStarted = useRef(false);
  useEffect(() => {
    if (mission.state.log.length > 0) liveStarted.current = true;
  }, [mission.state.log.length]);

  // on launch: bring back the form and the last results, unless a search already started
  // (e.g. the demo deep link) in the half second it took to read storage
  useEffect(() => {
    (async () => {
      const [s, r] = await Promise.all([loadSearch(), loadResults()]);
      if (s) setSearch((cur) => (cur === DEFAULT_SEARCH ? { ...s, useCache: s.useCache } : cur));
      if (r) {
        setSaved(r);
        if (!liveStarted.current) restore({ ...r, savedAt: r.savedAt });
      }
      loaded.current = true;
    })();
  }, [restore]);

  // save the form as it changes (after the first load, so defaults don't overwrite what was saved)
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => saveSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // save each live search once it finishes (restored results aren't saved again)
  const { summary, restoredAt, urls, scanned, ranked, running } = mission.state;
  useEffect(() => {
    if (!summary || restoredAt || running) return;
    const r: SavedResults = { savedAt: new Date().toISOString(), search, urls, scanned, ranked, summary };
    saveResults(r).then(() => setSaved(r));
    // only when a search finishes, not on every keystroke in the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, restoredAt, running]);

  const showSaved = useCallback(() => {
    if (saved) restore({ ...saved, savedAt: saved.savedAt });
  }, [saved, restore]);

  const refreshWatchCount = useCallback(async () => {
    try {
      const r = await api.listWatches(email.includes("@") ? email : undefined);
      setWatchCount(r.watched_clinics.length);
    } catch {
      // backend offline, keep the old count
    }
  }, [email]);

  // keep the count in sync when the email changes or a mission auto-watches full clinics
  const watched = mission.state.watched;
  useEffect(() => {
    let cancelled = false;
    api
      .listWatches(email.includes("@") ? email : undefined)
      .then((r) => {
        if (!cancelled) setWatchCount(r.watched_clinics.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [email, watched]);

  const { start } = mission;
  const launch = useCallback(
    (overrides: Partial<Search> = {}) => {
      const s = { ...search, ...overrides };
      start({
        city: s.city.trim() || "London, ON",
        user_postal_code: s.postalCode.trim() || null,
        preferences: [],
        language: s.language,
        coverage_type: s.coverage,
        user_email: s.email.trim() || null,
        auto_watch_closed: true,
        use_cache: s.useCache || publicDemo,
        max_clinics: Math.max(1, Math.min(MAX_CLINICS, Number(s.maxClinics) || 5)),
        refresh: s.recheckAll ? "all" : "auto",
      });
    },
    [search, start, publicDemo],
  );

  const value = useMemo(
    () => ({
      search,
      setSearch,
      mission,
      launch,
      publicDemo,
      backendUp,
      alert,
      setAlert,
      watchCount,
      setWatchCount,
      refreshWatchCount,
      ownerKey,
      saveOwnerKey,
      savedAt: saved?.savedAt ?? null,
      showSaved,
    }),
    [search, mission, launch, publicDemo, backendUp, alert, watchCount, refreshWatchCount, ownerKey, saveOwnerKey, saved, showSaved],
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState has to be used inside <AppStateProvider>");
  return ctx;
}
