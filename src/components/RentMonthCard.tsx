import { ChevronRight, Paperclip } from "lucide-react";
import { RentStatusBadge } from "@/components/RentStatusBadge";
import { cn } from "@/lib/utils";
import type { RentStatus } from "@/types";

interface RentMonthCardProps {
  monthLabel: string;
  amount: string;
  dueDate: string;
  status: RentStatus;
  hasReceipt?: boolean;
  onClick?: () => void;
  className?: string;
}

export function RentMonthCard({
  monthLabel,
  amount,
  dueDate,
  status,
  hasReceipt,
  onClick,
  className,
}: RentMonthCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-card border border-border bg-card p-4 text-left shadow-subtle transition-colors sm:p-5",
        "hover:bg-sage-50/40 active:bg-sage-50",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-ink">{monthLabel}</p>
          {hasReceipt && <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink/30" />}
        </div>
        <p className="mt-0.5 text-sm text-ink/60">
          {amount} · Due {dueDate}
        </p>
        <RentStatusBadge status={status} className="mt-2" />
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink/30" />
    </button>
  );
}
