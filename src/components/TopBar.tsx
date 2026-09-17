import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, LogOut, Settings, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";
import { ROLE_HOME } from "@/i18n/translations";
import type { NightSafeNotification } from "@/types";
import {
  SYSTEM_NOTIFICATION_PREFERENCE_EVENT,
  getSeenNotificationIds,
  getSystemNotificationPermission,
  getSystemNotificationPreference,
  hasSeenNotificationSnapshot,
  rememberNotificationIds,
  showSystemNotification,
} from "@/lib/system-notifications";

interface NotificationResponse {
  notifications: NightSafeNotification[];
  unreadCount: number;
}

export function TopBar() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NightSafeNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [systemAlertsOn, setSystemAlertsOn] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = user?.nickname?.trim() || user?.name;
  const settingsPath = user ? `${ROLE_HOME[user.role]}/settings`.replace("//", "/") : "/login";
  const notificationsPath = user ? `${ROLE_HOME[user.role]}/notifications`.replace("//", "/") : "/login";

  function syncSystemAlertState() {
    if (!user) {
      setSystemAlertsOn(false);
      return;
    }
    setSystemAlertsOn(
      getSystemNotificationPreference(user.id) && getSystemNotificationPermission() === "granted",
    );
  }

  async function loadNotifications(options: { showLoading?: boolean; allowSystemAlert?: boolean } = {}) {
    if (!user) return;
    if (options.showLoading) setNotificationsLoading(true);
    try {
      const data = await api.get<NotificationResponse>("/api/notifications?limit=20");
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);

      const hadSnapshot = hasSeenNotificationSnapshot(user.id);
      const seen = getSeenNotificationIds(user.id);
      const unseen = hadSnapshot
        ? data.notifications.filter((item) => !seen.has(item.id) && !item.read_at)
        : [];

      rememberNotificationIds(user.id, data.notifications.map((item) => item.id));

      if (
        options.allowSystemAlert
        && unseen.length > 0
        && getSystemNotificationPreference(user.id)
        && getSystemNotificationPermission() === "granted"
      ) {
        for (const item of [...unseen].reverse()) {
          try { await showSystemNotification(item); } catch { /* In-app notifications remain available if the OS alert fails. */ }
        }
      }
    } catch {
      // The bell remains usable even if a transient poll fails; the next poll retries automatically.
    } finally {
      if (options.showLoading) setNotificationsLoading(false);
    }
  }

  useEffect(() => {
    if (!accountOpen && !notificationsOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [accountOpen, notificationsOpen]);

  useEffect(() => {
    if (!user) return;
    syncSystemAlertState();
    void loadNotifications({ allowSystemAlert: true });
    const timer = window.setInterval(() => void loadNotifications({ allowSystemAlert: true }), 30000);
    const sync = () => syncSystemAlertState();
    const refreshOnFocus = () => {
      syncSystemAlertState();
      void loadNotifications({ allowSystemAlert: true });
    };
    window.addEventListener(SYSTEM_NOTIFICATION_PREFERENCE_EVENT, sync);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(SYSTEM_NOTIFICATION_PREFERENCE_EVENT, sync);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [user?.id]);

  async function markRead(notification: NightSafeNotification) {
    if (!notification.read_at) {
      try {
        await api.post(`/api/notifications/${encodeURIComponent(notification.id)}/read`);
        setNotifications((items) => items.map((item) => item.id === notification.id
          ? { ...item, read_at: item.read_at ?? new Date().toISOString() }
          : item));
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        // Opening the related page is still useful even if the read marker cannot be saved immediately.
      }
    }
  }

  async function openNotification(notification: NightSafeNotification) {
    await markRead(notification);
    setNotificationsOpen(false);
    if (notification.href) navigate(notification.href);
  }

  async function markAllRead() {
    try {
      await api.post("/api/notifications/read-all");
      const now = new Date().toISOString();
      setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at ?? now })));
      setUnreadCount(0);
    } catch {
      // The next refresh keeps the server state authoritative.
    }
  }

  async function signOut() {
    setAccountOpen(false);
    setNotificationsOpen(false);
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="relative z-40 flex items-center justify-between border-b border-border/80 bg-card/90 px-4 py-3 shadow-[0_1px_0_rgba(90,63,43,0.03)] backdrop-blur sm:px-6 lg:px-10">
      <div className="min-w-0" data-i18n-skip>
        <p className="truncate text-sm font-medium text-ink">{displayName}</p>
        <p className="truncate text-xs text-ink/50">{user?.email}</p>
      </div>

      <div className="flex items-center gap-2" ref={menuRef}>
        <div className="relative">
          <button
            type="button"
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            onClick={() => {
              setAccountOpen(false);
              setNotificationsOpen((value) => !value);
              void loadNotifications({ showLoading: true });
            }}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-midnight-600 shadow-subtle transition hover:-translate-y-0.5 hover:bg-sage-50 hover:text-sage-700 hover:shadow-raised"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-status-overdue px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-white" data-i18n-skip>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-border bg-card shadow-raised sm:w-96">
              <div className="flex items-center justify-between border-b border-border bg-sage-50/60 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Notifications</p>
                  <p className="text-xs text-ink/50" data-i18n-skip>{unreadCount} unread</p>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-sage-700 hover:text-sage-800"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {!systemAlertsOn && (
                <button
                  type="button"
                  onClick={() => { setNotificationsOpen(false); navigate(`${settingsPath}#notifications`); }}
                  className="w-full border-b border-border bg-status-waiting/10 px-4 py-2.5 text-left text-xs leading-relaxed text-ink/65 transition hover:bg-status-waiting/15"
                >
                  System notifications are off. Open Settings to enable alerts on this device.
                </button>
              )}

              <div className="max-h-[24rem] overflow-y-auto">
                {notificationsLoading && notifications.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-ink/45">Loading…</p>
                ) : notifications.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-ink/50">No notifications yet</p>
                ) : (
                  notifications.slice(0, 8).map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => void openNotification(notification)}
                      className={`block w-full border-b border-border/70 px-4 py-3 text-left transition last:border-b-0 hover:bg-sage-50/70 ${notification.read_at ? "bg-white" : "bg-sage-50/40"}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.read_at ? "bg-transparent" : "bg-sage-600"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-medium text-ink">{notification.title}</p>
                            {!notification.read_at && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-sage-700">New</span>}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink/55">{notification.body}</p>
                          <p className="mt-1 text-[10px] text-ink/40" data-i18n-skip>{new Date(notification.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => { setNotificationsOpen(false); navigate(notificationsPath); }}
                className="w-full border-t border-border bg-white px-4 py-3 text-center text-sm font-medium text-sage-700 transition hover:bg-sage-50"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            aria-label="Account menu"
            aria-expanded={accountOpen}
            onClick={() => {
              setNotificationsOpen(false);
              setAccountOpen((value) => !value);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-gradient-to-br from-white to-sage-50 text-sage-700 shadow-subtle transition hover:-translate-y-0.5 hover:shadow-raised"
          >
            <UserRound className="h-5 w-5" />
          </button>

          {accountOpen && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-card border border-border bg-card shadow-raised">
              <div className="border-b border-border bg-sage-50/60 px-4 py-3" data-i18n-skip>
                <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
                <p className="truncate text-xs text-ink/50">{user?.email}</p>
              </div>
              <div className="p-1.5">
                <button
                  type="button"
                  onClick={() => { setAccountOpen(false); navigate(settingsPath); }}
                  className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-left text-sm font-medium text-ink/75 transition hover:bg-sage-50 hover:text-ink"
                >
                  <Settings className="h-4 w-4" />
                  {t("common.settings")}
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-left text-sm font-medium text-ink/75 transition hover:bg-[#F7E7E1] hover:text-status-overdue"
                >
                  <LogOut className="h-4 w-4" />
                  {t("common.signOut")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
