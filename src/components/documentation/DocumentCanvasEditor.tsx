import { useEffect, useRef, useState } from "react";
import { Brush, Crop, Highlighter, RotateCw, Type, Undo2, Redo2, ScanLine, Eraser, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

type Tool = "PAN" | "CROP" | "DRAW" | "HIGHLIGHT" | "REDACT" | "BLUR" | "TEXT";
interface Box { x: number; y: number; width: number; height: number }

interface DocumentCanvasEditorProps {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onSave: (file: File) => void;
}

const MAX_DIM = 1800;
const HISTORY_LIMIT = 10;

function canvasFile(canvas: HTMLCanvasElement): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? new File([blob], "edited-document.jpg", { type: "image/jpeg" }) : null), "image/jpeg", 0.9);
  });
}

export function DocumentCanvasEditor({ open, file, onClose, onSave }: DocumentCanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const originalRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<Tool>("PAN");
  const [zoom, setZoom] = useState(1);
  const [history, setHistory] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [selection, setSelection] = useState<Box | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [grayscale, setGrayscale] = useState(false);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function currentSnapshot() {
    return canvasRef.current?.toDataURL("image/png") ?? null;
  }

  function pushHistory() {
    const snapshot = currentSnapshot();
    if (!snapshot) return;
    setHistory((items) => [...items.slice(-(HISTORY_LIMIT - 1)), snapshot]);
    setFuture([]);
  }

  function restore(dataUrl: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new Image();
    image.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      ctx.drawImage(image, 0, 0);
      setSelection(null);
    };
    image.src = dataUrl;
  }

  useEffect(() => {
    if (!open || !file) return;
    setMessage(null);
    if (!file.type.startsWith("image/")) {
      setMessage("Canvas editing is available for JPG and PNG images. PDF documents remain viewable but are not rasterized in the browser editor.");
      return;
    }
    const url = URL.createObjectURL(file);
    imageUrlRef.current = url;
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = Math.min(1, MAX_DIM / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      originalRef.current = canvas.toDataURL("image/png");
      setHistory([]);
      setFuture([]);
      setSelection(null);
      setZoom(1);
      setBrightness(100);
      setContrast(100);
      setGrayscale(false);
      URL.revokeObjectURL(url);
      imageUrlRef.current = null;
    };
    image.onerror = () => setMessage("We couldn't open this image in the editor.");
    image.src = url;
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    };
  }, [open, file]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "PAN") return;
    event.preventDefault();
    const p = point(event);
    if (tool === "TEXT") {
      if (!text.trim()) {
        setMessage("Enter text in the toolbar first, then tap the document to place it.");
        return;
      }
      pushHistory();
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#111827";
      ctx.font = `${Math.max(18, (canvasRef.current?.width ?? 1000) / 36)}px sans-serif`;
      ctx.fillText(text.trim(), p.x, p.y);
      return;
    }
    pushHistory();
    dragStartRef.current = p;
    setSelection({ x: p.x, y: p.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const start = dragStartRef.current;
    if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    const p = point(event);
    if (tool === "DRAW") {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = Math.max(3, (canvasRef.current?.width ?? 1000) / 250);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      dragStartRef.current = p;
      return;
    }
    setSelection({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y) });
  }

  function pointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragStartRef.current = null;
    if (tool === "DRAW") setSelection(null);
  }

  function rotate() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pushHistory();
    const source = document.createElement("canvas");
    source.width = canvas.width;
    source.height = canvas.height;
    source.getContext("2d")?.drawImage(canvas, 0, 0);
    canvas.width = source.height;
    canvas.height = source.width;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    setSelection(null);
  }

  function applyAdjustments() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pushHistory();
    const source = document.createElement("canvas");
    source.width = canvas.width;
    source.height = canvas.height;
    source.getContext("2d")?.drawImage(canvas, 0, 0);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) grayscale(${grayscale ? 100 : 0}%)`;
    ctx.drawImage(source, 0, 0);
    ctx.filter = "none";
    setBrightness(100);
    setContrast(100);
    setGrayscale(false);
  }

  function enhance() {
    setBrightness(104);
    setContrast(112);
    setGrayscale(false);
    requestAnimationFrame(applyAdjustments);
  }

  function applySelection() {
    const canvas = canvasRef.current;
    const box = selection;
    if (!canvas || !box || box.width < 2 || box.height < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (tool === "CROP") {
      const source = document.createElement("canvas");
      source.width = Math.round(box.width);
      source.height = Math.round(box.height);
      source.getContext("2d")?.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, source.width, source.height);
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.getContext("2d")?.drawImage(source, 0, 0);
    } else if (tool === "REDACT") {
      ctx.fillStyle = "#000";
      ctx.fillRect(box.x, box.y, box.width, box.height);
    } else if (tool === "HIGHLIGHT") {
      ctx.fillStyle = "rgba(250,204,21,.32)";
      ctx.fillRect(box.x, box.y, box.width, box.height);
    } else if (tool === "BLUR") {
      const source = document.createElement("canvas");
      source.width = canvas.width;
      source.height = canvas.height;
      source.getContext("2d")?.drawImage(canvas, 0, 0);
      ctx.save();
      ctx.filter = "blur(14px)";
      ctx.drawImage(source, box.x, box.y, box.width, box.height, box.x, box.y, box.width, box.height);
      ctx.restore();
    }
    setSelection(null);
  }

  function undo() {
    const previous = history[history.length - 1];
    const current = currentSnapshot();
    if (!previous || !current) return;
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [...items, current]);
    restore(previous);
  }

  function redo() {
    const next = future[future.length - 1];
    const current = currentSnapshot();
    if (!next || !current) return;
    setFuture((items) => items.slice(0, -1));
    setHistory((items) => [...items, current]);
    restore(next);
  }

  function reset() {
    if (!originalRef.current) return;
    const current = currentSnapshot();
    if (current) setHistory((items) => [...items.slice(-(HISTORY_LIMIT - 1)), current]);
    restore(originalRef.current);
    setFuture([]);
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const output = await canvasFile(canvas);
      if (output) onSave(output);
    } finally {
      setSaving(false);
    }
  }

  const tools: Array<{ id: Tool; label: string; icon: typeof Crop }> = [
    { id: "CROP", label: "Crop", icon: Crop },
    { id: "DRAW", label: "Draw", icon: Brush },
    { id: "HIGHLIGHT", label: "Highlight", icon: Highlighter },
    { id: "REDACT", label: "Redact", icon: Eraser },
    { id: "BLUR", label: "Blur", icon: ScanLine },
    { id: "TEXT", label: "Text", icon: Type },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Edit document" className="max-w-5xl sm:p-6">
      {message && <p className="mb-3 rounded-input bg-status-waiting/10 p-3 text-sm text-ink">{message}</p>}
      <div className="mb-3 flex flex-wrap gap-2">
        {tools.map(({ id, label, icon: Icon }) => (
          <Button key={id} size="sm" variant={tool === id ? "primary" : "secondary"} onClick={() => { setTool(id); setSelection(null); }} icon={<Icon className="h-4 w-4" />}>
            {label}
          </Button>
        ))}
        <Button size="sm" variant="secondary" onClick={rotate} icon={<RotateCw className="h-4 w-4" />}>Rotate</Button>
        <Button size="sm" variant="secondary" onClick={enhance} icon={<Wand2 className="h-4 w-4" />}>Enhance</Button>
        <Button size="sm" variant="secondary" onClick={undo} disabled={!history.length} icon={<Undo2 className="h-4 w-4" />}>Undo</Button>
        <Button size="sm" variant="secondary" onClick={redo} disabled={!future.length} icon={<Redo2 className="h-4 w-4" />}>Redo</Button>
      </div>

      <div className="mb-3 grid gap-3 rounded-card border border-border bg-sage-50/40 p-3 md:grid-cols-5">
        <label className="text-xs font-medium text-ink/70">Brightness
          <input className="mt-1 w-full" type="range" min="50" max="150" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} />
        </label>
        <label className="text-xs font-medium text-ink/70">Contrast
          <input className="mt-1 w-full" type="range" min="50" max="160" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-ink/70"><input type="checkbox" checked={grayscale} onChange={(e) => setGrayscale(e.target.checked)} /> Grayscale</label>
        <Button size="sm" variant="secondary" onClick={applyAdjustments}>Apply adjustments</Button>
        <label className="text-xs font-medium text-ink/70">Zoom
          <input className="mt-1 w-full" type="range" min="50" max="200" value={Math.round(zoom * 100)} onChange={(e) => setZoom(Number(e.target.value) / 100)} />
        </label>
      </div>

      {tool === "TEXT" && <Input label="Text to place" value={text} onChange={(e) => setText(e.target.value)} placeholder="Enter text, then tap the document" className="mb-3" />}

      <div className="relative max-h-[58vh] overflow-auto rounded-card border border-border bg-midnight-900/5 p-3 touch-pan-x touch-pan-y">
        <div className="relative mx-auto origin-top-left" style={{ width: "fit-content", transform: `scale(${zoom})`, marginBottom: `${Math.max(0, (zoom - 1) * 300)}px` }}>
          <canvas
            ref={canvasRef}
            className="block max-w-none bg-white shadow-raised"
            style={{ touchAction: tool === "PAN" ? "auto" : "none", maxWidth: "min(82vw, 900px)", height: "auto" }}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            aria-label="Document editing canvas"
          />
          {selection && (
            <div
              className="pointer-events-none absolute border-2 border-sage-600 bg-sage-400/10"
              style={{
                left: `${(selection.x / (canvasRef.current?.width || 1)) * 100}%`,
                top: `${(selection.y / (canvasRef.current?.height || 1)) * 100}%`,
                width: `${(selection.width / (canvasRef.current?.width || 1)) * 100}%`,
                height: `${(selection.height / (canvasRef.current?.height || 1)) * 100}%`,
              }}
            />
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={reset}>Reset</Button>
          {selection && tool !== "DRAW" && <Button size="sm" variant="secondary" onClick={applySelection}>Apply {tool.toLowerCase()}</Button>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} loading={saving}>Save edited image</Button>
        </div>
      </div>
    </Modal>
  );
}
