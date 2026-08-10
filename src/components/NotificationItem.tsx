import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationItemProps {
  icon: LucideIcon;
  title: string;
  description: string;
  time: string;
  unread?: boolean;
  className?: string;
}

export function NotificationItem({
  icon: Icon,
  title,
  description,
  time,
  unread,
  className,
}: NotificationItemProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3.5 rounded-card border border-border bg-card p-4 shadow-subtle sm:p-5",
        className,
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-sage-50">
        <Icon className="h-5 w-5 text-sage-600" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-ink">{title}</p>
          {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sage-600" />}
        </div>
        <p className="mt-0.5 text-sm leading-relaxed text-ink/60">{description}</p>
        <p className="mt-1.5 text-xs text-ink/40">{time}</p>
      </div>
    </div>
  );
}
