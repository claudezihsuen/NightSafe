import { DoorOpen, User } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/types";

interface UnitCardProps {
  unitLabel: string;
  propertyName: string;
  occupant?: string;
  status?: PaymentStatus;
  className?: string;
}

export function UnitCard({ unitLabel, propertyName, occupant, status, className }: UnitCardProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-card border border-border bg-card p-4 shadow-subtle sm:p-5",
        className,
      )}
    >
      <div className="flex items-center gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input bg-sage-50">
          <DoorOpen className="h-5 w-5 text-sage-600" />
        </div>
        <div>
          <p className="font-medium text-ink">{unitLabel}</p>
          <p className="text-sm text-ink/60">{propertyName}</p>
          {occupant && (
            <div className="mt-1 flex items-center gap-1 text-xs text-ink/50">
              <User className="h-3 w-3" />
              {occupant}
            </div>
          )}
        </div>
      </div>
      {status && <StatusBadge status={status} />}
    </div>
  );
}
