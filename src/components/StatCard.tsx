import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  trend?: { direction: "up" | "down"; label: string };
  className?: string;
}

export function StatCard({ icon: Icon, label, value, trend, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-card border border-border bg-card p-5 shadow-subtle",
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-input bg-sage-50">
        <Icon className="h-5 w-5 text-sage-600" />
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight text-ink">{value}</p>
        <p className="text-sm text-ink/60">{label}</p>
      </div>
      {trend && (
        <div
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            trend.direction === "up" ? "text-status-confirmed" : "text-status-overdue",
          )}
        >
          {trend.direction === "up" ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          {trend.label}
        </div>
      )}
    </div>
  );
}
