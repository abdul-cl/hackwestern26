// How many clinics you're watching (the badge on the Watchdog tab)
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Watch } from "@/lib/types";

export function useWatchCount(email: string, autoWatched: Watch[]) {
  const [watchCount, setWatchCount] = useState(0);
  const who = email.includes("@") ? email : undefined;

  const refreshWatchCount = useCallback(async () => {
    try {
      setWatchCount((await api.listWatches(who)).watched_clinics.length);
    } catch {
      // backend offline, keep the old count
    }
  }, [who]);

  // re-count when the email changes or a search auto-watches full clinics
  useEffect(() => {
    let cancelled = false;
    api
      .listWatches(who)
      .then((r) => {
        if (!cancelled) setWatchCount(r.watched_clinics.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [who, autoWatched]);

  return { watchCount, setWatchCount, refreshWatchCount };
}
