import { CheckCheck, CheckCircle2, Clock, Hourglass, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RentStatus } from "@/types";

const config: Record<RentStatus, { label: string; icon: typeof Clock; classes: string }> = {
  PAID: {
    label: "Paid",
    icon: CheckCircle2,
    classes: "bg-status-confirmed/10 text-status-confirmed",
  },
  WAITING_PAYMENT: {
    label: "Waiting Payment",
    icon: Clock,
    classes: "bg-status-waiting/10 text-status-waiting",
  },
  PENDING: {
    label: "Pending",
    icon: Hourglass,
    classes: "bg-status-pending/10 text-status-pending",
  },
  PAYMENT_CONFIRMED: {
    label: "Payment Confirmed",
    icon: CheckCheck,
    classes: "bg-status-confirmed/10 text-status-confirmed",
  },
  REJECTED: {
    label: "Rejected",
    icon: XCircle,
    classes: "bg-status-overdue/10 text-status-overdue",
  },
};

interface RentStatusBadgeProps {
  status: RentStatus;
  className?: string;
}

export function RentStatusBadge({ status, className }: RentStatusBadgeProps) {
  const { label, icon: Icon, classes } = config[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        classes,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
