// State every tab shares. Each piece lives in its own hook (src/hooks/) and this just puts them
// together: the search form, the running search (so it keeps going when you switch tabs),
// backend status, opening alerts, offline results and the watch count
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_SEARCH, toMissionRequest, type Search } from "@/lib/config";
import type { WatchAlert } from "@/lib/types";
import { useBackend } from "@/hooks/useBackend";
import { useMission, type Mission } from "@/hooks/useMission";
import { useOpeningAlerts } from "@/hooks/useOpeningAlerts";
import { useSavedResults } from "@/hooks/useSavedResults";
import { useWatchCount } from "@/hooks/useWatchCount";

type AppState = {
  search: Search;
  setSearch: React.Dispatch<React.SetStateAction<Search>>;
  mission: Mission;
  launch: (overrides?: Partial<Search>) => void;
  loadMore: () => void;
  backendUp: boolean | null; // null until the first health check comes back
  publicDemo: boolean;
  emailAlerts: boolean; // the server emails watchers when a clinic opens
  ownerKey: string;
  saveOwnerKey: (key: string) => Promise<void>;
  alert: WatchAlert | null;
  setAlert: (a: WatchAlert | null, opts?: { notifyIn?: number }) => void;
  watchCount: number;
  setWatchCount: (n: number) => void;
  refreshWatchCount: () => void;
  savedAt: string | null; // when the last finished search was saved on this phone
  showSaved: () => void; // put those saved results back on screen (used when offline)
};

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState<Search>(DEFAULT_SEARCH);
  const email = search.email.trim();
  const mission = useMission();

  // the public demo only serves saved results, so flip the form to match
  const toDemo = useCallback(() => setSearch((s) => ({ ...s, useCache: true })), []);
  const { backendUp, publicDemo, emailAlerts, ownerKey, saveOwnerKey } = useBackend(toDemo);
  const { alert, setAlert } = useOpeningAlerts(email, backendUp);
  const { savedAt, showSaved } = useSavedResults(search, setSearch, mission);
  const { watchCount, setWatchCount, refreshWatchCount } = useWatchCount(email, mission.state.watched);

  const { start, loadMore: missionLoadMore } = mission;
  const launch = useCallback(
    (overrides: Partial<Search> = {}) => start(toMissionRequest({ ...search, ...overrides }, publicDemo)),
    [search, start, publicDemo],
  );
  const loadMore = useCallback(() => missionLoadMore(toMissionRequest(search, publicDemo)), [search, missionLoadMore, publicDemo]);

  const value = useMemo(
    () => ({
      search, setSearch, mission, launch, loadMore,
      backendUp, publicDemo, emailAlerts, ownerKey, saveOwnerKey,
      alert, setAlert, watchCount, setWatchCount, refreshWatchCount, savedAt, showSaved,
    }),
    [search, mission, launch, loadMore, backendUp, publicDemo, emailAlerts, ownerKey, saveOwnerKey, alert, setAlert, watchCount, setWatchCount, refreshWatchCount, savedAt, showSaved],
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState has to be used inside <AppStateProvider>");
  return ctx;
}
