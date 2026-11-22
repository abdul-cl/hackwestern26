// Opening alerts: the in-app banner plus a phone notification, each alert only once.
// With an email set it also asks the server for new alerts every minute while the app is open,
// and right away when you come back to it (the server's own watchdog does the clinic checks)
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState as RNAppState } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { alertId, loadSeenAlerts, notifyOpening, onNotificationTap, saveSeenAlerts, setupNotifications } from "@/lib/notify";
import type { WatchAlert } from "@/lib/types";

const POLL_MS = 60_000;

export function useOpeningAlerts(email: string, backendUp: boolean | null) {
  const [alert, setAlertState] = useState<WatchAlert | null>(null);
  // alerts we've already shown, kept on the phone between launches. null = never loaded anything yet
  const seen = useRef<Set<number> | null>(null);
  const seenLoaded = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    seenLoaded.current = loadSeenAlerts().then((s) => (seen.current = s));
  }, []);

  const remember = useCallback((ids: (number | null)[]) => {
    const set = seen.current ?? new Set<number>();
    ids.forEach((id) => id != null && set.add(id));
    seen.current = set;
    saveSeenAlerts(set);
  }, []);

  const setAlert = useCallback(
    (a: WatchAlert | null, opts: { notifyIn?: number } = {}) => {
      setAlertState(a);
      if (!a) return;
      const id = alertId(a);
      if (id != null) {
        if (seen.current?.has(id)) return; // already told you about this one
        remember([id]);
      } else if (email.includes("@")) {
        // fresh from "Check all" or the demo button: it has no alert id yet, so mark what's on the
        // server now as seen, otherwise the next poll would notify about the same opening again
        api.watchAlerts(email, 10).then((r) => remember(r.alerts.map(alertId))).catch(() => {});
      }
      notifyOpening(a, opts.notifyIn).catch(() => {});
    },
    [email, remember],
  );

  useEffect(() => {
    setupNotifications().catch(() => {});
    // tapping a notification opens the Watchdog tab
    return onNotificationTap((screen) => router.navigate(screen as "/watchdog"));
  }, []);

  useEffect(() => {
    if (!email.includes("@") || backendUp === false) return;
    let stopped = false;
    const poll = async () => {
      await seenLoaded.current;
      try {
        const { alerts } = await api.watchAlerts(email, 10);
        if (stopped) return;
        const firstRun = seen.current === null;
        const set = seen.current ?? new Set<number>();
        // the very first time, just remember what's there instead of notifying about old alerts
        if (firstRun) return remember(alerts.map(alertId));
        const fresh = alerts.filter((a) => alertId(a) != null && !set.has(alertId(a)!));
        fresh.reverse().forEach((a) => setAlert(a)); // oldest first, so the newest ends up as the banner
      } catch {
        // offline for a moment, try again next time
      }
    };
    poll();
    const timer = setInterval(() => {
      if (RNAppState.currentState === "active") poll();
    }, POLL_MS);
    const sub = RNAppState.addEventListener("change", (s) => {
      if (s === "active") poll();
    });
    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [email, backendUp, setAlert, remember]);

  return { alert, setAlert };
}
