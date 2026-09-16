import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface SignaturePadProps {
  open: boolean;
  title?: string;
  onCancel: () => void;
  onSave: (file: File) => Promise<void> | void;
}

export function SignaturePad({ open, title = "Sign", onCancel, onSave }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  function snapshot() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHistory((prev) => [...prev.slice(-12), canvas.toDataURL("image/png")]);
    setFuture([]);
  }

  function clearCanvas(record = true) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (record) snapshot();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(320, Math.floor(canvas.clientWidth * ratio));
    const height = Math.max(220, Math.floor(260 * ratio));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setHistory([]);
    setFuture([]);
    setHasInk(false);
  }, [open]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    snapshot();
    drawingRef.current = true;
    lastRef.current = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const next = point(event);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = Math.max(3, canvas.width / 170);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    lastRef.current = next;
    setHasInk(true);
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    lastRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function restore(dataUrl: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new Image();
    image.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      setHasInk(true);
    };
    image.src = dataUrl;
  }

  function undo() {
    const canvas = canvasRef.current;
    const previous = history[history.length - 1];
    if (!canvas || !previous) return;
    setFuture((f) => [...f, canvas.toDataURL("image/png")]);
    setHistory((h) => h.slice(0, -1));
    restore(previous);
  }

  function redo() {
    const canvas = canvasRef.current;
    const next = future[future.length - 1];
    if (!canvas || !next) return;
    setHistory((h) => [...h, canvas.toDataURL("image/png")]);
    setFuture((f) => f.slice(0, -1));
    restore(next);
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      await onSave(new File([blob], "signature.png", { type: "image/png" }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p className="mb-3 text-sm text-ink/60">Sign inside the box using your finger, stylus, or mouse.</p>
      <canvas
        ref={canvasRef}
        className="h-[260px] w-full touch-none rounded-input border border-border bg-white"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="Signature drawing area"
      />
      <div className="mt-3 grid grid-cols-3 gap-2 sm:flex">
        <Button variant="secondary" size="sm" onClick={undo} disabled={!history.length}>Undo</Button>
        <Button variant="secondary" size="sm" onClick={redo} disabled={!future.length}>Redo</Button>
        <Button variant="secondary" size="sm" onClick={() => clearCanvas()}>Clear</Button>
        <div className="hidden flex-1 sm:block" />
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={save} loading={saving} disabled={!hasInk}>Save signature</Button>
      </div>
    </Modal>
  );
}
