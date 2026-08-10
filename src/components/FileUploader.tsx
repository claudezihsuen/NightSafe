import { useRef, useState } from "react";
import { CheckCircle2, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploaderProps {
  label?: string;
  hint?: string;
  onFileSelect?: (file: File | null) => void;
  className?: string;
}

export function FileUploader({
  label = "Upload receipt",
  hint = "PNG, JPG or PDF, up to 10MB",
  onFileSelect,
  className,
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const setFile = (file: File | null) => {
    setFileName(file?.name ?? null);
    onFileSelect?.(file);
  };

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      {fileName ? (
        <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-card p-4 shadow-subtle">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-sage-50">
              <CheckCircle2 className="h-5 w-5 text-status-confirmed" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{fileName}</p>
              <p className="text-xs text-ink/50">Ready to submit</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Remove file"
            onClick={() => setFile(null)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-input text-ink/40 hover:bg-sage-50 hover:text-ink/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={() => setIsDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragActive(false);
            setFile(e.dataTransfer.files?.[0] ?? null);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border bg-card px-4 py-8 text-center transition-colors",
            "hover:border-sage-300 hover:bg-sage-50/30",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
            isDragActive && "border-sage-400 bg-sage-50/50",
          )}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sage-50">
            <UploadCloud className="h-5 w-5 text-sage-600" />
          </div>
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-xs text-ink/50">{hint}</p>
        </button>
      )}
    </div>
  );
}
