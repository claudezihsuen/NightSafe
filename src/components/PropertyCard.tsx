import { Building2, ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface PropertyCardProps {
  name: string;
  address: string;
  units: number;
  onClick?: () => void;
  className?: string;
}

export function PropertyCard({ name, address, units, onClick, className }: PropertyCardProps) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3.5 rounded-card border border-border bg-card p-4 text-left shadow-subtle transition-colors sm:p-5",
        onClick && "hover:bg-sage-50/40 active:bg-sage-50",
        className,
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input bg-sage-50">
        <Building2 className="h-5 w-5 text-sage-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{name}</p>
        <div className="mt-0.5 flex items-center gap-1 text-sm text-ink/60">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{address}</span>
        </div>
        <p className="mt-2 text-xs font-medium text-sage-700">
          {units} {units === 1 ? "unit" : "units"}
        </p>
      </div>
      {onClick && <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-ink/30" />}
    </Wrapper>
  );
}
