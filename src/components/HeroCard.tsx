import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeroCardProps {
  eyebrow: string;
  title: string;
  description?: string;
  value?: string;
  valueLabel?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

export function HeroCard({
  eyebrow,
  title,
  description,
  value,
  valueLabel,
  icon: Icon,
  action,
  className,
}: HeroCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-card bg-midnight-700 px-5 py-6 text-white shadow-raised sm:px-8 sm:py-8",
        className,
      )}
    >
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-sage-200/70">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-snug sm:text-2xl">{title}</h2>
          {description && (
            <p className="mt-2 text-sm leading-relaxed text-white/60">{description}</p>
          )}
          {action && <div className="mt-5">{action}</div>}
        </div>

        {value && (
          <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:text-right">
            {Icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-white/10 sm:hidden">
                <Icon className="h-5 w-5 text-sage-200" />
              </div>
            )}
            <div>
              <p className="text-3xl font-semibold tracking-tight sm:text-4xl">{value}</p>
              {valueLabel && <p className="text-xs text-white/50">{valueLabel}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
