import { useEffect, useRef, useState } from "react";
import {
  Brush,
  Crop,
  Eye,
  Hand,
  Highlighter,
  RotateCcw,
  RotateCw,
  Type,
  Undo2,
  Redo2,
  ScanLine,
  Eraser,
  Wand2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

type Tool = "PAN" | "CROP" | "DRAW" | "ERASE" | "HIGHLIGHT" | "REDACT" | "BLUR" | "TEXT";
type Corner = "nw" | "ne" | "sw" | "se";
interface Box { x: number; y: number; width: number; height: number }
interface TextItem { id: string; text: string; x: number; y: number; size: number }
interface EditorState { canvas: string; textItems: TextItem[] }

interface DocumentCanvasEditorProps {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onSave: (file: File) => void;
}

const MAX_DIM = 1800;
const HISTORY_LIMIT = 8;

function canvasFile(canvas: HTMLCanvasElement): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? new File([blob], "edited-document.jpg", { type: "image/jpeg" }) : null), "image/jpeg", 0.9);
  });
}

function cloneCanvas(source: HTMLCanvasElement) {
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext("2d")?.drawImage(source, 0, 0);
  return copy;
}

function copyTextItems(items: TextItem[]) {
  return items.map((item) => ({ ...item }));
}

export function DocumentCanvasEditor({ open, file, onClose, onSave }: DocumentCanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const originalRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const textDragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const drawingBaseRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<Tool>("PAN");
  const [zoom, setZoom] = useState(1);
  const [history, setHistory] = useState<EditorState[]>([]);
  const [future, setFuture] = useState<EditorState[]>([]);
  const [selection, setSelection] = useState<Box | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [grayscale, setGrayscale] = useState(false);
  const [text, setText] = useState("");
  const [textSize, setTextSize] = useState(32);
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [strokeWidth, setStrokeWidth] = useState(8);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  function currentState(): EditorState | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return { canvas: canvas.toDataURL("image/png"), textItems: copyTextItems(textItems) };
  }

  function pushHistory() {
    const state = currentState();
    if (!state) return;
    setHistory((items) => [...items.slice(-(HISTORY_LIMIT - 1)), state]);
    setFuture([]);
  }

  function restore(state: EditorState) {
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
      drawingBaseRef.current = null;
    };
    image.src = state.canvas;
    setTextItems(copyTextItems(state.textItems));
    setSelectedTextId(null);
  }

  useEffect(() => {
    if (!open || !file) return;
    setMessage(null);
    setPreviewMode(false);
    setTextItems([]);
    setSelectedTextId(null);
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
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      originalRef.current = canvas.toDataURL("image/png");
      drawingBaseRef.current = null;
      setHistory([]);
      setFuture([]);
      setSelection(null);
      setTool("PAN");
      setZoom(1);
      setBrightness(100);
      setContrast(100);
      setGrayscale(false);
      setText("");
      setTextSize(32);
      setStrokeWidth(8);
      setTextItems([]);
      setSelectedTextId(null);
      URL.revokeObjectURL(url);
      imageUrlRef.current = null;
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      imageUrlRef.current = null;
      setMessage("We couldn't open this image in the editor.");
    };
    image.src = url;
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      drawingBaseRef.current = null;
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

  function pointFromWrapper(event: React.PointerEvent<HTMLElement>) {
    const canvas = canvasRef.current;
    const wrapper = event.currentTarget.parentElement;
    if (!canvas || !wrapper) return { x: 0, y: 0 };
    const rect = wrapper.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function ensureDrawingBase() {
    const canvas = canvasRef.current;
    if (canvas && !drawingBaseRef.current) drawingBaseRef.current = cloneCanvas(canvas);
  }

  function resetDrawingSession() {
    drawingBaseRef.current = null;
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "PAN" || previewMode) return;
    event.preventDefault();
    const p = point(event);
    if (tool === "TEXT") {
      if (!text.trim()) {
        setMessage("Enter text in the toolbar first, then tap the document to place it.");
        return;
      }
      pushHistory();
      const item: TextItem = { id: crypto.randomUUID(), text: text.trim(), x: p.x, y: p.y, size: Math.max(12, textSize) };
      setTextItems((items) => [...items, item]);
      setSelectedTextId(item.id);
      setMessage("Text placed. Drag it to move, adjust the size, or delete it before saving.");
      return;
    }
    pushHistory();
    if (tool === "DRAW" || tool === "ERASE") ensureDrawingBase();
    else resetDrawingSession();
    dragStartRef.current = p;
    if (tool !== "DRAW" && tool !== "ERASE") setSelection({ x: p.x, y: p.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function eraseBetween(start: { x: number; y: number }, end: { x: number; y: number }) {
    const canvas = canvasRef.current;
    const base = drawingBaseRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const radius = Math.max(4, strokeWidth * 1.5);
    const length = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
    const steps = Math.max(1, Math.ceil(length / Math.max(2, radius / 2)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t;
      const sx = Math.max(0, x - radius);
      const sy = Math.max(0, y - radius);
      const size = radius * 2;
      ctx.drawImage(base, sx, sy, size, size, sx, sy, size, size);
    }
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
      ctx.lineWidth = Math.max(2, strokeWidth);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      dragStartRef.current = p;
      return;
    }
    if (tool === "ERASE") {
      eraseBetween(start, p);
      dragStartRef.current = p;
      return;
    }
    setSelection({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y) });
  }

  function pointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragStartRef.current = null;
    if (tool === "DRAW" || tool === "ERASE") setSelection(null);
  }

  function startTextDrag(item: TextItem, event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    pushHistory();
    const p = pointFromWrapper(event);
    textDragRef.current = { id: item.id, offsetX: p.x - item.x, offsetY: p.y - item.y };
    setSelectedTextId(item.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveText(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = textDragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    const p = pointFromWrapper(event);
    setTextItems((items) => items.map((item) => item.id === drag.id ? {
      ...item,
      x: Math.max(0, Math.min(canvas.width, p.x - drag.offsetX)),
      y: Math.max(0, Math.min(canvas.height, p.y - drag.offsetY)),
    } : item));
  }

  function endTextDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    textDragRef.current = null;
  }

  function rotate(direction: 1 | -1) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pushHistory();
    resetDrawingSession();
    const oldWidth = canvas.width;
    const oldHeight = canvas.height;
    const source = cloneCanvas(canvas);
    canvas.width = source.height;
    canvas.height = source.width;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(direction * Math.PI / 2);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    setTextItems((items) => items.map((item) => direction === 1
      ? { ...item, x: Math.max(0, oldHeight - item.y), y: Math.max(0, item.x) }
      : { ...item, x: Math.max(0, item.y), y: Math.max(0, oldWidth - item.x) }));
    setSelection(null);
  }

  function applyFilter(brightnessValue: number, contrastValue: number, grayscaleValue: boolean, recordHistory = true) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (recordHistory) pushHistory();
    resetDrawingSession();
    const source = cloneCanvas(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = `brightness(${brightnessValue}%) contrast(${contrastValue}%) grayscale(${grayscaleValue ? 100 : 0}%)`;
    ctx.drawImage(source, 0, 0);
    ctx.filter = "none";
  }

  function applyAdjustments() {
    applyFilter(brightness, contrast, grayscale);
    setBrightness(100);
    setContrast(100);
    setGrayscale(false);
  }

  function enhance() {
    applyFilter(104, 112, false);
    setBrightness(100);
    setContrast(100);
    setGrayscale(false);
  }

  function applySelection() {
    const canvas = canvasRef.current;
    const box = selection;
    if (!canvas || !box || box.width < 2 || box.height < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    resetDrawingSession();
    if (tool === "CROP") {
      const source = document.createElement("canvas");
      source.width = Math.max(1, Math.round(box.width));
      source.height = Math.max(1, Math.round(box.height));
      source.getContext("2d")?.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, source.width, source.height);
      canvas.width = source.width;
      canvas.height = source.height;
      const next = canvas.getContext("2d");
      if (next) {
        next.fillStyle = "white";
        next.fillRect(0, 0, canvas.width, canvas.height);
        next.drawImage(source, 0, 0);
      }
      setTextItems((items) => items
        .filter((item) => item.x >= box.x && item.x <= box.x + box.width && item.y >= box.y && item.y <= box.y + box.height)
        .map((item) => ({ ...item, x: item.x - box.x, y: item.y - box.y })));
    } else if (tool === "REDACT") {
      ctx.fillStyle = "#000";
      ctx.fillRect(box.x, box.y, box.width, box.height);
    } else if (tool === "HIGHLIGHT") {
      ctx.fillStyle = "rgba(250,204,21,.32)";
      ctx.fillRect(box.x, box.y, box.width, box.height);
    } else if (tool === "BLUR") {
      const source = cloneCanvas(canvas);
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.width, box.height);
      ctx.clip();
      ctx.filter = "blur(14px)";
      ctx.drawImage(source, 0, 0);
      ctx.filter = "none";
      ctx.restore();
    }
    setSelection(null);
  }

  function resizeSelection(corner: Corner, event: React.PointerEvent<HTMLButtonElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !selection) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width, ((event.clientX - rect.left) / rect.width) * canvas.width));
    const y = Math.max(0, Math.min(canvas.height, ((event.clientY - rect.top) / rect.height) * canvas.height));
    const right = selection.x + selection.width;
    const bottom = selection.y + selection.height;
    const minSize = 8;
    if (corner === "nw") setSelection({ x: Math.min(x, right - minSize), y: Math.min(y, bottom - minSize), width: right - Math.min(x, right - minSize), height: bottom - Math.min(y, bottom - minSize) });
    if (corner === "ne") setSelection({ x: selection.x, y: Math.min(y, bottom - minSize), width: Math.max(minSize, x - selection.x), height: bottom - Math.min(y, bottom - minSize) });
    if (corner === "sw") setSelection({ x: Math.min(x, right - minSize), y: selection.y, width: right - Math.min(x, right - minSize), height: Math.max(minSize, y - selection.y) });
    if (corner === "se") setSelection({ x: selection.x, y: selection.y, width: Math.max(minSize, x - selection.x), height: Math.max(minSize, y - selection.y) });
  }

  function clearDrawing() {
    const canvas = canvasRef.current;
    const base = drawingBaseRef.current;
    if (!canvas || !base) return;
    pushHistory();
    canvas.width = base.width;
    canvas.height = base.height;
    canvas.getContext("2d")?.drawImage(base, 0, 0);
    drawingBaseRef.current = null;
  }

  function undo() {
    const previous = history[history.length - 1];
    const current = currentState();
    if (!previous || !current) return;
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [...items.slice(-(HISTORY_LIMIT - 1)), current]);
    restore(previous);
  }

  function redo() {
    const next = future[future.length - 1];
    const current = currentState();
    if (!next || !current) return;
    setFuture((items) => items.slice(0, -1));
    setHistory((items) => [...items.slice(-(HISTORY_LIMIT - 1)), current]);
    restore(next);
  }

  function reset() {
    if (!originalRef.current) return;
    const current = currentState();
    if (current) setHistory((items) => [...items.slice(-(HISTORY_LIMIT - 1)), current]);
    restore({ canvas: originalRef.current, textItems: [] });
    setFuture([]);
    setBrightness(100);
    setContrast(100);
    setGrayscale(false);
    setPreviewMode(false);
  }

  function updateSelectedTextSize(size: number) {
    setTextSize(size);
    if (!selectedTextId) return;
    setTextItems((items) => items.map((item) => item.id === selectedTextId ? { ...item, size } : item));
  }

  function deleteSelectedText() {
    if (!selectedTextId) return;
    pushHistory();
    setTextItems((items) => items.filter((item) => item.id !== selectedTextId));
    setSelectedTextId(null);
  }

  function enterPreview() {
    if (brightness !== 100 || contrast !== 100 || grayscale) applyAdjustments();
    setSelection(null);
    setSelectedTextId(null);
    setPreviewMode(true);
  }

  function renderFinalCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const output = cloneCanvas(canvas);
    const ctx = output.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#111827";
    ctx.textBaseline = "top";
    for (const item of textItems) {
      ctx.font = `${Math.max(12, item.size)}px sans-serif`;
      ctx.fillText(item.text, item.x, item.y);
    }
    return output;
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setMessage(null);
    try {
      if (brightness !== 100 || contrast !== 100 || grayscale) {
        applyFilter(brightness, contrast, grayscale, false);
        setBrightness(100);
        setContrast(100);
        setGrayscale(false);
      }
      const finalCanvas = renderFinalCanvas();
      if (!finalCanvas) throw new Error("Canvas export failed");
      const output = await canvasFile(finalCanvas);
      if (!output) throw new Error("Canvas export failed");
      onSave(output);
    } catch {
      setMessage("We couldn't save this document. Please try again. Your current editing session is still open.");
    } finally {
      setSaving(false);
    }
  }

  const selectedText = textItems.find((item) => item.id === selectedTextId) ?? null;
  const canvas = canvasRef.current;
  const displayScale = canvas?.width ? (canvas.clientWidth || canvas.width) / canvas.width : 1;

  const tools: Array<{ id: Tool; label: string; icon: typeof Crop }> = [
    { id: "PAN", label: "Pan", icon: Hand },
    { id: "CROP", label: "Crop", icon: Crop },
    { id: "DRAW", label: "Draw", icon: Brush },
    { id: "ERASE", label: "Eraser", icon: Eraser },
    { id: "HIGHLIGHT", label: "Highlight", icon: Highlighter },
    { id: "REDACT", label: "Redact", icon: Eraser },
    { id: "BLUR", label: "Blur", icon: ScanLine },
    { id: "TEXT", label: "Text", icon: Type },
  ];

  return (
    <Modal open={open} onClose={onClose} title={previewMode ? "Preview document" : "Edit document"} className="max-w-5xl sm:p-6">
      {message && <p className="mb-3 rounded-input bg-status-waiting/10 p-3 text-sm text-ink">{message}</p>}

      {!previewMode && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {tools.map(({ id, label, icon: Icon }) => (
              <Button key={id} size="sm" variant={tool === id ? "primary" : "secondary"} onClick={() => { setTool(id); setSelection(null); setSelectedTextId(null); }} icon={<Icon className="h-4 w-4" />}>
                {label}
              </Button>
            ))}
            <Button size="sm" variant="secondary" onClick={() => rotate(-1)} icon={<RotateCcw className="h-4 w-4" />}>Rotate left</Button>
            <Button size="sm" variant="secondary" onClick={() => rotate(1)} icon={<RotateCw className="h-4 w-4" />}>Rotate right</Button>
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

          {(tool === "DRAW" || tool === "ERASE") && (
            <div className="mb-3 flex flex-wrap items-end gap-3 rounded-card border border-border bg-white p-3">
              <label className="min-w-40 text-xs font-medium text-ink/70">Stroke / eraser size
                <input className="mt-1 w-full" type="range" min="2" max="40" value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} />
              </label>
              <Button size="sm" variant="secondary" onClick={clearDrawing} disabled={!drawingBaseRef.current} icon={<Trash2 className="h-4 w-4" />}>Clear drawing</Button>
            </div>
          )}

          {tool === "TEXT" && (
            <div className="mb-3 grid gap-3 rounded-card border border-border bg-white p-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
              <Input label="Text to place" value={text} onChange={(e) => setText(e.target.value)} placeholder="Enter text, then tap the document" />
              <label className="text-xs font-medium text-ink/70">{selectedText ? "Selected text size" : "New text size"}
                <input
                  className="mt-2 w-full"
                  type="range"
                  min="14"
                  max="72"
                  value={selectedText?.size ?? textSize}
                  onPointerDown={() => { if (selectedTextId) pushHistory(); }}
                  onChange={(e) => updateSelectedTextSize(Number(e.target.value))}
                />
              </label>
              <Button size="sm" variant="danger" disabled={!selectedTextId} onClick={deleteSelectedText} icon={<Trash2 className="h-4 w-4" />}>Delete text</Button>
              <p className="text-xs text-ink/50 sm:col-span-3">Tap the document to add text. Tap and drag a placed text item to move it; select it to resize or delete it.</p>
            </div>
          )}
        </>
      )}

      <div className="relative max-h-[58vh] overflow-auto rounded-card border border-border bg-midnight-900/5 p-3 touch-pan-x touch-pan-y">
        <div data-canvas-wrapper className="relative mx-auto origin-top-left" style={{ width: "fit-content", transform: `scale(${zoom})`, marginBottom: `${Math.max(0, (zoom - 1) * 300)}px` }}>
          <canvas
            ref={canvasRef}
            className="block max-w-none bg-white shadow-raised"
            style={{ touchAction: tool === "PAN" || previewMode ? "auto" : "none", maxWidth: "min(82vw, 900px)", height: "auto" }}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            aria-label="Document editing canvas"
          />

          {textItems.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Text: ${item.text}. Drag to move.`}
              className={cnTextItem(previewMode, selectedTextId === item.id)}
              style={{
                left: `${(item.x / (canvasRef.current?.width || 1)) * 100}%`,
                top: `${(item.y / (canvasRef.current?.height || 1)) * 100}%`,
                fontSize: `${Math.max(10, item.size * displayScale)}px`,
                pointerEvents: previewMode ? "none" : "auto",
              }}
              onPointerDown={(event) => startTextDrag(item, event)}
              onPointerMove={moveText}
              onPointerUp={endTextDrag}
              onPointerCancel={endTextDrag}
              onClick={(event) => { event.stopPropagation(); setSelectedTextId(item.id); setTool("TEXT"); }}
            >
              {item.text}
            </button>
          ))}

          {!previewMode && selection && (
            <div
              className="absolute border-2 border-sage-600 bg-sage-400/10"
              style={{
                left: `${(selection.x / (canvasRef.current?.width || 1)) * 100}%`,
                top: `${(selection.y / (canvasRef.current?.height || 1)) * 100}%`,
                width: `${(selection.width / (canvasRef.current?.width || 1)) * 100}%`,
                height: `${(selection.height / (canvasRef.current?.height || 1)) * 100}%`,
                pointerEvents: tool === "CROP" ? "auto" : "none",
              }}
            >
              {tool === "CROP" && (["nw", "ne", "sw", "se"] as Corner[]).map((corner) => (
                <button
                  key={corner}
                  aria-label={`Resize crop ${corner}`}
                  className={`absolute h-7 w-7 rounded-full border-3 border-white bg-sage-600 shadow-raised ${corner.includes("n") ? "-top-3" : "-bottom-3"} ${corner.includes("w") ? "-left-3" : "-right-3"}`}
                  onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); }}
                  onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeSelection(corner, event); }}
                  onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {!previewMode && <Button size="sm" variant="ghost" onClick={reset}>Reset</Button>}
          {!previewMode && selection && !["DRAW", "ERASE", "TEXT"].includes(tool) && <Button size="sm" variant="secondary" onClick={applySelection}>Apply {tool.toLowerCase()}</Button>}
          {!previewMode && <Button size="sm" variant="secondary" onClick={enterPreview} icon={<Eye className="h-4 w-4" />}>Preview</Button>}
          {previewMode && <Button size="sm" variant="secondary" onClick={() => setPreviewMode(false)}>Back to edit</Button>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} loading={saving}>Save edited image</Button>
        </div>
      </div>
    </Modal>
  );
}

function cnTextItem(preview: boolean, selected: boolean) {
  if (preview) return "absolute z-20 cursor-default whitespace-nowrap bg-transparent p-0 text-left leading-none text-ink";
  return `absolute z-20 touch-none whitespace-nowrap rounded border px-1 py-0.5 text-left leading-none text-ink ${selected ? "border-sage-600 bg-white/90 shadow-subtle" : "border-transparent bg-white/40 hover:border-sage-300"}`;
}
