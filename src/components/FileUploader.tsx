import { useEffect, useRef, useState } from "react";
import { FileText, Repeat, UploadCloud, X } from "lucide-react";
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
  const [file, setFileState] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const setFile = (next: File | null) => {
    setFileState(next);
    onFileSelect?.(next);
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

      {file ? (
        <div className="overflow-hidden rounded-card border border-border bg-card shadow-subtle">
          {previewUrl ? (
            <div className="flex h-40 items-center justify-center bg-sage-50/50">
              <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center bg-sage-50/50">
              <FileText className="h-8 w-8 text-sage-500" />
            </div>
          )}

          <div className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{file.name}</p>
              <p className="text-xs text-ink/50">Ready to submit</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                aria-label="Replace file"
                className="flex h-8 w-8 items-center justify-center rounded-input text-ink/40 hover:bg-sage-50 hover:text-ink/70"
              >
                <Repeat className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label="Remove file"
                className="flex h-8 w-8 items-center justify-center rounded-input text-ink/40 hover:bg-sage-50 hover:text-ink/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
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
