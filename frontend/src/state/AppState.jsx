import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { DEFAULT_SEARCH, DEMO_EMAIL, MAX_CLINICS } from "../config";
import { useMission } from "../hooks/useMission";

const AppStateContext = createContext(null);

/**
 * State shared by every page: the search form, the running mission (so it keeps going while you browse other
 * pages), the opening-alert banner and the Watchdog count shown in the nav.
 */
export function AppStateProvider({ children }) {
  const [search, setSearch] = useState(DEFAULT_SEARCH);
  const mission = useMission();
  const [alert, setAlert] = useState(null);
  const [watchCount, setWatchCount] = useState(0);
  // The backend tells us if it's a public deployment: then only saved (demo) results are available.
  const [publicDemo, setPublicDemo] = useState(false);
  const email = search.email.trim();

  useEffect(() => {
    api
      .health()
      .then((h) => {
        if (h.public_demo) {
          // public demo: saved results only, and watchlists use the shared demo account (no real emails stored)
          setPublicDemo(true);
          setSearch((s) => ({ ...s, useCache: true, email: DEMO_EMAIL }));
        }
      })
      .catch(() => {
        /* backend unreachable: pages show their own errors */
      });
  }, []);

  const refreshWatchCount = useCallback(async () => {
    try {
      const r = await api.listWatches(email.includes("@") ? email : undefined);
      setWatchCount(r.watched_clinics.length);
    } catch {
      /* backend offline: keep the old count */
    }
  }, [email]);

  useEffect(() => {
    refreshWatchCount();
  }, [refreshWatchCount]);

  useEffect(() => {
    if (mission.state.watched.length) refreshWatchCount(); // a mission auto-enrolled full clinics
  }, [mission.state.watched, refreshWatchCount]);

  const launch = useCallback(
    (overrides = {}) => {
      const s = { ...search, ...overrides };
      mission.start({
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
    [search, mission, publicDemo],
  );

  const value = useMemo(
    () => ({ search, setSearch, mission, launch, alert, setAlert, watchCount, setWatchCount, refreshWatchCount, publicDemo }),
    [search, mission, launch, alert, watchCount, refreshWatchCount, publicDemo],
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used inside <AppStateProvider>");
  return ctx;
}
