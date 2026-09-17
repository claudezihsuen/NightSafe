import type { NightSafeNotification } from "@/types";

export const SYSTEM_NOTIFICATION_PREFERENCE_EVENT = "nightsafe-system-notification-preference";
const PREFERENCE_KEY_PREFIX = "nightsafe-system-notifications:";
const SEEN_KEY_PREFIX = "nightsafe-notification-seen:";

export type SystemNotificationPermission = NotificationPermission | "unsupported";

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function storageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function storageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); } catch { /* Device storage can be unavailable in private modes. */ }
}

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandaloneApp(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || Boolean((navigator as NavigatorWithStandalone).standalone);
}

export function systemNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getSystemNotificationPermission(): SystemNotificationPermission {
  return systemNotificationsSupported() ? Notification.permission : "unsupported";
}

export function getSystemNotificationPreference(userId: string): boolean {
  return storageGet(`${PREFERENCE_KEY_PREFIX}${userId}`) === "on";
}

export function setSystemNotificationPreference(userId: string, enabled: boolean): void {
  storageSet(`${PREFERENCE_KEY_PREFIX}${userId}`, enabled ? "on" : "off");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SYSTEM_NOTIFICATION_PREFERENCE_EVENT, { detail: { userId, enabled } }));
  }
}

export async function requestSystemNotificationPermission(): Promise<SystemNotificationPermission> {
  if (!systemNotificationsSupported()) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") return Notification.permission;
  return Notification.requestPermission();
}

export function hasSeenNotificationSnapshot(userId: string): boolean {
  return storageGet(`${SEEN_KEY_PREFIX}${userId}`) !== null;
}

export function getSeenNotificationIds(userId: string): Set<string> {
  const raw = storageGet(`${SEEN_KEY_PREFIX}${userId}`);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

export function rememberNotificationIds(userId: string, ids: string[]): void {
  const current = getSeenNotificationIds(userId);
  const merged: string[] = [];
  for (const id of ids) {
    if (!current.has(id)) merged.push(id);
  }
  for (const id of current) merged.push(id);
  storageSet(`${SEEN_KEY_PREFIX}${userId}`, JSON.stringify(merged.slice(0, 200)));
}

export async function showSystemNotification(notification: NightSafeNotification): Promise<void> {
  if (!systemNotificationsSupported() || Notification.permission !== "granted") return;

  const options: NotificationOptions = {
    body: notification.body,
    icon: "/icons/nightsafe-android.svg",
    tag: `nightsafe-${notification.id}`,
    data: { href: notification.href || "/" },
  };

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.showNotification(notification.title, options);
      return;
    }
  }

  const nativeNotification = new Notification(notification.title, options);
  nativeNotification.onclick = () => {
    window.focus();
    if (notification.href) window.location.assign(notification.href);
    nativeNotification.close();
  };
}
