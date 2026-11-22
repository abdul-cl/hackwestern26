// Talks to /health: is the backend up, is it the public demo, is Auto-Fill available.
// Also keeps the owner key (unlocks live agents on the public deployment), which changes the answer
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, setAdminKey } from "@/lib/api";

const ADMIN_KEY_STORAGE = "carescout_admin_key";

export function useBackend(onPublicDemo: () => void) {
  const [backendUp, setBackendUp] = useState<boolean | null>(null); // null until the first answer
  const [publicDemo, setPublicDemo] = useState(false);
  const [applyAvailable, setApplyAvailable] = useState(true); // false only if the backend turned Auto-Fill off
  const [ownerKey, setOwnerKey] = useState("");

  const checkHealth = useCallback(async () => {
    try {
      const h = await api.health();
      setBackendUp(true);
      setPublicDemo(!!h.public_demo);
      setApplyAvailable(h.apply !== false);
      if (h.public_demo) onPublicDemo();
    } catch {
      setBackendUp(false);
    }
  }, [onPublicDemo]);

  // load the owner key (if any) first so the very first health check already sends it
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

  return { backendUp, publicDemo, applyAvailable, ownerKey, saveOwnerKey };
}
