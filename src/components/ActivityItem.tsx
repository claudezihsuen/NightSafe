import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityItemProps {
  icon: LucideIcon;
  description: string;
  time: string;
  isLast?: boolean;
  className?: string;
}

export function ActivityItem({ icon: Icon, description, time, isLast, className }: ActivityItemProps) {
  return (
    <div className={cn("flex gap-3.5", className)}>
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage-50">
          <Icon className="h-4 w-4 text-sage-600" />
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className="min-w-0 pb-5">
        <p className="text-sm leading-relaxed text-ink">{description}</p>
        <p className="mt-0.5 text-xs text-ink/40">{time}</p>
      </div>
    </div>
  );
}
