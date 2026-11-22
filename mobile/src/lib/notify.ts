// Phone notifications for watched clinics. These are local notifications: the app asks the
// server for new alerts and then puts them on the phone itself, so no push server is needed.
// Note: in Expo Go the app only checks while it's open (or when you come back to it).
// A notification that's already scheduled still shows up if you leave the app.
import * as Notifications from "expo-notifications";
import { AndroidImportance, IosAuthorizationStatus } from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { WatchAlert } from "./types";

const CHANNEL = "openings";
const SEEN_KEY = "carescout_seen_alerts";

export const canNotify = true;

let ready = false;
export async function setupNotifications() {
  if (ready) return;
  ready = true;
  // inside the app the green banner already shows the alert, so only drop it in the notification
  // list (no second banner on top). once you've left the app it shows as a normal notification
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Clinic openings",
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: "#0F6B58",
    }).catch(() => {});
  }
}

export type NotifyPermission = "granted" | "denied" | "undetermined";

export async function notifyPermission(): Promise<NotifyPermission> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted || p.ios?.status === IosAuthorizationStatus.PROVISIONAL) return "granted";
    return p.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "denied";
  }
}

export async function askToNotify(): Promise<NotifyPermission> {
  await setupNotifications();
  try {
    const p = await Notifications.requestPermissionsAsync();
    if (p.granted) return "granted";
    return p.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "denied";
  }
}

// delaySeconds lets the demo button fire a couple of seconds later, so you can lock the phone and watch it arrive
export async function notifyOpening(alert: WatchAlert, delaySeconds = 0) {
  if ((await notifyPermission()) !== "granted") return false;
  await setupNotifications();
  const status = alert.new_status === "waitlist" ? "has a waitlist open" : "is accepting patients";
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${alert.clinic_name} ${status}`,
      body: alert.evidence_quote ? `"${alert.evidence_quote.slice(0, 140)}"` : "Tap to see it in CareScout.",
      data: { screen: "/watchdog", url: alert.url },
      sound: true,
    },
    trigger:
      delaySeconds > 0
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds, channelId: CHANNEL }
        : Platform.OS === "android" ? { channelId: CHANNEL } : null,
  });
  return true;
}

// tapping a notification (also the one that opened the app from closed) calls this with the screen to open
export function onNotificationTap(go: (screen: string) => void) {
  const handle = (r: Notifications.NotificationResponse | null) => {
    const screen = r?.notification.request.content.data?.screen;
    if (typeof screen === "string") go(screen);
  };
  Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

// which alerts we've already told you about, so each one only notifies once
export async function loadSeenAlerts(): Promise<Set<number> | null> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as number[]) : null;
  } catch {
    return null;
  }
}

export async function saveSeenAlerts(seen: Set<number>) {
  // only the newest few hundred matter
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300))).catch(() => {});
}

// only alerts read back from the server have alert_id ("id" on an alert is the watch's id, not the alert's)
export const alertId = (a: WatchAlert) => a.alert_id ?? null;
