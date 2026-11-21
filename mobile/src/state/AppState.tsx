// State every tab shares: the search form and the running mission,
// so a search keeps going even if you switch tabs halfway through
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { DEFAULT_SEARCH, MAX_CLINICS, type Search } from "@/lib/config";
import { useMission, type Mission } from "@/hooks/useMission";

type AppState = {
  search: Search;
  setSearch: React.Dispatch<React.SetStateAction<Search>>;
  mission: Mission;
  launch: (overrides?: Partial<Search>) => void;
  publicDemo: boolean;
  backendUp: boolean | null; // null until the first health check comes back
};

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState<Search>(DEFAULT_SEARCH);
  const mission = useMission();
  const [publicDemo, setPublicDemo] = useState(false);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  // check the backend once on startup. if it's the public deployment only saved results work
  useEffect(() => {
    api
      .health()
      .then((h) => {
        setBackendUp(true);
        if (h.public_demo) {
          setPublicDemo(true);
          setSearch((s) => ({ ...s, useCache: true }));
        }
      })
      .catch(() => setBackendUp(false));
  }, []);

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
    () => ({ search, setSearch, mission, launch, publicDemo, backendUp }),
    [search, mission, launch, publicDemo, backendUp],
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState has to be used inside <AppStateProvider>");
  return ctx;
}
