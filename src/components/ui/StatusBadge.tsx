import { Clock, Hourglass, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/types";

const config: Record<
  PaymentStatus,
  { label: string; icon: typeof Clock; classes: string }
> = {
  WAITING_PAYMENT: {
    label: "Waiting payment",
    icon: Clock,
    classes: "bg-status-waiting/10 text-status-waiting",
  },
  PENDING_REVIEW: {
    label: "Pending review",
    icon: Hourglass,
    classes: "bg-status-pending/10 text-status-pending",
  },
  PAYMENT_CONFIRMED: {
    label: "Confirmed",
    icon: CheckCircle2,
    classes: "bg-status-confirmed/10 text-status-confirmed",
  },
  OVERDUE: {
    label: "Overdue",
    icon: AlertCircle,
    classes: "bg-status-overdue/10 text-status-overdue",
  },
};

interface StatusBadgeProps {
  status: PaymentStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
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
