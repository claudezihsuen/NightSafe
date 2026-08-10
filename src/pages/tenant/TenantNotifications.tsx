import { Bell, CheckCircle2, FileText, Megaphone, Wallet, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { NotificationItem } from "@/components/NotificationItem";

const notifications = [
  {
    icon: Wallet,
    title: "Rent due soon",
    description: "Your August rent of $1,200.00 is due on Aug 15.",
    time: "2h ago",
    unread: true,
  },
  {
    icon: CheckCircle2,
    title: "Payment confirmed",
    description: "Your May rent payment was confirmed by Sarah Chen.",
    time: "3 months ago",
  },
  {
    icon: XCircle,
    title: "Payment rejected",
    description: "Your April receipt was rejected — please resubmit a clearer photo.",
    time: "4 months ago",
  },
  {
    icon: Wallet,
    title: "Payment submitted",
    description: "Your June rent receipt was submitted and is awaiting review.",
    time: "2 months ago",
  },
  {
    icon: FileText,
    title: "Agreement updated",
    description: "Your rental agreement was renewed for 12 months.",
    time: "7 months ago",
  },
  {
    icon: Megaphone,
    title: "Notice from Sagewood Residences",
    description: "Water will be shut off briefly on Aug 20 for scheduled maintenance.",
    time: "1 day ago",
  },
];

export function TenantNotifications() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Notifications" description="Updates about your rental." />
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-white px-6 py-12 text-center">
          <Bell className="mb-3 h-6 w-6 text-sage-500" />
          <p className="text-sm font-medium text-ink">You're all caught up</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((n, i) => (
            <NotificationItem key={i} {...n} />
          ))}
        </div>
      )}
    </div>
  );
}
