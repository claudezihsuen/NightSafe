import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, id, className, children, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-ink/80">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              "h-11 w-full appearance-none rounded-input border border-border bg-white px-3.5 pr-10 text-sm text-ink",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
              error && "border-status-overdue focus-visible:ring-status-overdue",
              className,
            )}
            aria-invalid={Boolean(error)}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
        </div>
        {error && <p className="text-sm text-status-overdue">{error}</p>}
        {!error && hint && <p className="text-sm text-ink/50">{hint}</p>}
      </div>
    );
  },
);

Select.displayName = "Select";
