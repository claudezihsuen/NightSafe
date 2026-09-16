import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError } from "@/lib/api";
import type { NightSafeNotification } from "@/types";

export function TenantNotifications() {
  const [notifications, setNotifications] = useState<NightSafeNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.get<{ notifications: NightSafeNotification[]; unreadCount: number }>("/api/tenant/notifications");
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your notifications.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function markRead(id: string) {
    await api.post(`/api/tenant/notifications/${id}/read`);
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
  }
  async function markAll() {
    await api.post("/api/tenant/notifications/read-all");
    const now = new Date().toISOString();
    setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    setUnreadCount(0);
  }

  return <div className="animate-fade-in-up">
    <PageHeader title="Notifications" description={`${unreadCount} unread · in-app rental updates only.`} action={unreadCount ? <Button size="sm" variant="secondary" onClick={() => void markAll()} icon={<CheckCheck className="h-4 w-4" />}>Mark all read</Button> : undefined} />
    {loading && <div className="flex flex-col gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
    {!loading && error && <p className="text-sm text-status-overdue">{error}</p>}
    {!loading && !error && notifications.length === 0 && <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-white px-6 py-12 text-center"><Bell className="mb-3 h-7 w-7 text-sage-500" /><p className="font-medium text-ink">No notifications yet</p></div>}
    {!loading && !error && notifications.length > 0 && <div className="space-y-3">{notifications.map((notification) => {
      const content = <div className={`rounded-card border p-4 shadow-subtle transition-colors ${notification.read_at ? "border-border bg-white" : "border-sage-300 bg-sage-50/60"}`}><div className="flex items-start gap-3"><div className="rounded-input bg-white p-2 text-sage-700"><Bell className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-ink">{notification.title}</p><span className="text-xs text-ink/45">{new Date(notification.created_at).toLocaleString()}</span></div><p className="mt-1 text-sm text-ink/60">{notification.body}</p>{notification.type && <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-sage-700">{notification.type.replaceAll("_", " ")}</p>}</div>{!notification.read_at && <button onClick={(event) => { event.preventDefault(); event.stopPropagation(); void markRead(notification.id); }} className="shrink-0 rounded-full border border-sage-200 px-2 py-1 text-xs font-medium text-sage-700">Read</button>}</div></div>;
      return notification.href ? <Link key={notification.id} to={notification.href} onClick={() => { if (!notification.read_at) void markRead(notification.id); }}>{content}</Link> : <div key={notification.id}>{content}</div>;
    })}</div>}
  </div>;
}
