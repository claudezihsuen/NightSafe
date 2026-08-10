import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/types";

interface PaymentCardProps {
  title: string;
  subtitle: string;
  amount: string;
  status: PaymentStatus;
  onClick?: () => void;
  className?: string;
}

export function PaymentCard({ title, subtitle, amount, status, onClick, className }: PaymentCardProps) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-card border border-border bg-card p-4 text-left shadow-subtle transition-colors sm:p-5",
        onClick && "hover:bg-sage-50/40 active:bg-sage-50",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{title}</p>
        <p className="truncate text-sm text-ink/60">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-semibold text-ink">{amount}</p>
          <StatusBadge status={status} className="mt-1" />
        </div>
        {onClick && <ChevronRight className="h-4 w-4 text-ink/30" />}
      </div>
    </Wrapper>
  );
}
