// The website version of the app doesn't do phone notifications, these just do nothing
import type { WatchAlert } from "./types";

export const canNotify = false;
export type NotifyPermission = "granted" | "denied" | "undetermined";
export async function setupNotifications() {}
export async function notifyPermission(): Promise<NotifyPermission> {
  return "denied";
}
export async function askToNotify(): Promise<NotifyPermission> {
  return "denied";
}
export async function notifyOpening(_alert: WatchAlert, _delaySeconds = 0) {
  return false;
}
export function onNotificationTap(_go: (screen: string) => void) {
  return () => {};
}
export async function loadSeenAlerts(): Promise<Set<number> | null> {
  return null;
}
export async function saveSeenAlerts(_seen: Set<number>) {}
// only alerts read back from the server have alert_id ("id" on an alert is the watch's id, not the alert's)
export const alertId = (a: WatchAlert) => a.alert_id ?? null;
