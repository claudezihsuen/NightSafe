import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { NotificationItem } from "@/components/NotificationItem";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError } from "@/lib/api";

interface Notification {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export function TenantNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ notifications: Notification[] }>("/api/tenant/notifications")
      .then((data) => setNotifications(data.notifications))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your notifications."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Notifications" description="Updates about your rental." />

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {!loading && error && <p className="text-sm text-status-overdue">{error}</p>}

      {!loading && !error && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-white px-6 py-12 text-center">
          <Bell className="mb-3 h-6 w-6 text-sage-500" />
          <p className="text-sm font-medium text-ink">No notifications yet</p>
        </div>
      )}

      {!loading && !error && notifications.length > 0 && (
        <div className="flex flex-col gap-3">
          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              icon={Bell}
              title={n.title}
              description={n.body}
              time={new Date(n.created_at).toLocaleDateString()}
              unread={!n.read_at}
            />
          ))}
        </div>
      )}
    </div>
  );
}
