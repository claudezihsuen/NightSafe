import { CheckCircle2, FileText, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { NotificationItem } from "@/components/NotificationItem";

const notifications = [
  {
    icon: Wallet,
    title: "Rent due soon",
    description: "Your August rent of $1,200.00 is due in 3 days.",
    time: "2h ago",
    unread: true,
  },
  {
    icon: CheckCircle2,
    title: "Payment confirmed",
    description: "Your July rent payment was confirmed by the owner.",
    time: "3 weeks ago",
  },
  {
    icon: FileText,
    title: "Agreement updated",
    description: "Your rental agreement was renewed for 12 months.",
    time: "1 month ago",
  },
];

export function TenantNotifications() {
  return (
    <>
      <PageHeader title="Notifications" description="Updates about your rental." />
      <div className="flex flex-col gap-3">
        {notifications.map((n, i) => (
          <NotificationItem key={i} {...n} />
        ))}
      </div>
    </>
  );
}
