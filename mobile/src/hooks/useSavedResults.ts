// Offline support: remembers the form and the last finished search on the phone,
// and brings them back on launch (unless a live search already started)
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SEARCH, type Search } from "@/lib/config";
import { loadResults, loadSearch, saveResults, saveSearch, type SavedResults } from "@/lib/storage";
import type { Mission } from "./useMission";

export function useSavedResults(search: Search, setSearch: React.Dispatch<React.SetStateAction<Search>>, mission: Mission) {
  const [saved, setSaved] = useState<SavedResults | null>(null);
  const loaded = useRef(false);
  const { restore } = mission;
  const { summary, restoredAt, urls, scanned, ranked, running, log } = mission.state;

  // true once a live search has started, so saved results never replace it
  const liveStarted = useRef(false);
  useEffect(() => {
    if (log.length > 0) liveStarted.current = true;
  }, [log.length]);

  // on launch: the form and the last results (unless a search started in the half second it took, e.g. a demo link)
  useEffect(() => {
    (async () => {
      const [s, r] = await Promise.all([loadSearch(), loadResults()]);
      if (s) setSearch((cur) => (cur === DEFAULT_SEARCH ? s : cur));
      if (r) {
        setSaved(r);
        if (!liveStarted.current) restore({ ...r, savedAt: r.savedAt });
      }
      loaded.current = true;
    })();
  }, [restore, setSearch]);

  // save the form as it changes (after the first load, so defaults don't overwrite what was saved)
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => saveSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // save each live search when it finishes, and again after "Load more" (summary changes)
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

  return { savedAt: saved?.savedAt ?? null, showSaved };
}
