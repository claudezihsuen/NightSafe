import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/i18n/I18nProvider";

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
  const { user } = useAuth();
  const { greeting } = useI18n();
  const displayName = user?.nickname?.trim() || user?.name?.split(" ")[0] || "there";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-card border border-white/30 bg-gradient-to-br from-[#6B7661] via-[#556952] to-[#384B42] px-5 py-6 text-white shadow-raised sm:px-8 sm:py-8",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[#E8CFAF]/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 left-16 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-sm">
          <p className="mb-4 text-base font-semibold tracking-tight text-[#FFF7EA] sm:text-lg" data-i18n-skip>
            {greeting(displayName)}
          </p>
          <p className="text-xs font-medium uppercase tracking-wide text-[#F0D9BB]/80">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-snug sm:text-2xl">{title}</h2>
          {description && (
            <p className="mt-2 text-sm leading-relaxed text-white/70">{description}</p>
          )}
          {action && <div className="mt-5">{action}</div>}
        </div>

        {value && (
          <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:text-right">
            {Icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-white/10 sm:hidden">
                <Icon className="h-5 w-5 text-[#F0D9BB]" />
              </div>
            )}
            <div>
              <p className="text-3xl font-semibold tracking-tight sm:text-4xl">{value}</p>
              {valueLabel && <p className="text-xs text-white/55">{valueLabel}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
