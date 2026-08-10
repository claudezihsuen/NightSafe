import { forwardRef, useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, id, className, rows = 3, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-sm font-medium text-ink/80">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          className={cn(
            "resize-none rounded-input border border-border bg-white px-3.5 py-3 text-sm text-ink",
            "placeholder:text-ink/35",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
            error && "border-status-overdue focus-visible:ring-status-overdue",
            className,
          )}
          aria-invalid={Boolean(error)}
          {...props}
        />
        {error && <p className="text-sm text-status-overdue">{error}</p>}
        {!error && hint && <p className="text-sm text-ink/50">{hint}</p>}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";
