import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface TenantCardProps {
  name: string;
  unitLabel: string;
  isUnitLeader?: boolean;
  onClick?: () => void;
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function TenantCard({ name, unitLabel, isUnitLeader, onClick, className }: TenantCardProps) {
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
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-100 text-sm font-semibold text-sage-700">
          {getInitials(name)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{name}</p>
          <p className="truncate text-sm text-ink/60">{unitLabel}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isUnitLeader && (
          <span className="rounded-full bg-sage-50 px-2.5 py-1 text-xs font-medium text-sage-700">
            Unit Leader
          </span>
        )}
        {onClick && <ChevronRight className="h-4 w-4 text-ink/30" />}
      </div>
    </Wrapper>
  );
}
