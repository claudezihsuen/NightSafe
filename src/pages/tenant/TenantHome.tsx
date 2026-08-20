import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ChevronRight, FileText, History, ShieldCheck, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { HeroCard } from "@/components/HeroCard";
import { UnitCard } from "@/components/UnitCard";
import { NotificationItem } from "@/components/NotificationItem";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth-context";
import { useTenantPayments } from "@/lib/tenant-payments-context";
import { api } from "@/lib/api";
import { formatCents, formatDate, formatMonth } from "@/lib/format";

const quickActions = [
  { label: "Payment history", description: "See all past months", icon: History, to: "/tenant/payments" },
  { label: "Deposit", description: "View your deposit breakdown", icon: ShieldCheck, to: "/tenant/deposit" },
  { label: "Agreement", description: "View your lease", icon: FileText, to: "/tenant/agreement" },
  { label: "Notifications", description: "Updates & reminders", icon: Bell, to: "/tenant/notifications" },
];

interface Notification {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

interface TenantUnit {
  unit_label: string;
  property_name: string;
  property_address: string;
}

export function TenantHome() {
  const { user } = useAuth();
  const { currentRecord, loading } = useTenantPayments();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unit, setUnit] = useState<TenantUnit | null>(null);
  const firstName = user?.name?.split(" ")[0];

  const isWaiting = currentRecord?.status === "WAITING_PAYMENT";

  useEffect(() => {
    api
      .get<{ notifications: Notification[] }>("/api/tenant/notifications")
      .then((data) => setNotifications(data.notifications.slice(0, 2)))
      .catch(() => setNotifications([]));
    api
      .get<{ unit: TenantUnit | null }>("/api/tenant/unit")
      .then((data) => setUnit(data.unit))
      .catch(() => setUnit(null));
  }, []);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title={firstName ? `Welcome back, ${firstName}` : "Home"} description="Your rental at a glance." />

      {loading ? (
        <Skeleton className="mb-4 h-40 w-full" />
      ) : (
        <HeroCard
          eyebrow={currentRecord ? formatMonth(currentRecord.month) : "This month"}
          title={isWaiting ? "Your rent is due soon" : "You're all caught up"}
          description={
            currentRecord && isWaiting
              ? `${formatCents(currentRecord.amountCents)} due by ${formatDate(currentRecord.dueDate)}. Submit your receipt once paid.`
              : "No action needed on your rent right now."
          }
          value={currentRecord ? formatCents(currentRecord.amountCents) : undefined}
          valueLabel={isWaiting ? "due" : "this month"}
          icon={Wallet}
          action={
            isWaiting && currentRecord ? (
              <Link to={`/tenant/payments/${currentRecord.id}/pay`}>
                <Button size="sm">Make payment</Button>
              </Link>
            ) : undefined
          }
          className="mb-4"
        />
      )}

      <UnitCard
        unitLabel={unit ? unit.unit_label : "Unit not assigned yet"}
        propertyName={unit ? unit.property_name : "Contact your owner or agent"}
        className="mb-6"
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {quickActions.map(({ label, description, icon: Icon, to }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 rounded-card border border-border bg-card p-4 shadow-subtle transition-colors hover:bg-sage-50/40 active:bg-sage-50 sm:flex-col sm:items-start sm:gap-2 sm:p-5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-sage-50">
              <Icon className="h-5 w-5 text-sage-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{label}</p>
              <p className="text-sm text-ink/60">{description}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink/30 sm:hidden" />
          </Link>
        ))}
      </div>

      {notifications.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Recent notifications</h2>
            <Link to="/tenant/notifications" className="text-sm font-medium text-sage-700 hover:text-sage-800">
              View all
            </Link>
          </div>
          <div className="mt-3 flex flex-col gap-3">
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
        </>
      )}
    </div>
  );
}
