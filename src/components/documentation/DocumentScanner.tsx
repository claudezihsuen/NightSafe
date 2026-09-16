import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, RotateCw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface Point { x: number; y: number }
interface PixelPoint { x: number; y: number }
interface DetectionResult { corners: Point[]; detected: boolean }
interface DocumentScannerProps {
  open: boolean;
  onClose: () => void;
  onReady: (file: File) => void;
}

const MAX_CAPTURE_DIMENSION = 1800;
const DETECTION_DIMENSION = 320;

function fileFromCanvas(canvas: HTMLCanvasElement, name = "scanned-document.jpg"): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? new File([blob], name, { type: "image/jpeg" }) : null), "image/jpeg", 0.9);
  });
}

function defaultCorners(): Point[] {
  return [
    { x: 0.05, y: 0.05 },
    { x: 0.95, y: 0.05 },
    { x: 0.05, y: 0.95 },
    { x: 0.95, y: 0.95 },
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: PixelPoint, b: PixelPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function findPeak(scores: number[], start: number, end: number) {
  let index = start;
  let score = -Infinity;
  for (let i = start; i <= end; i += 1) {
    if ((scores[i] ?? 0) > score) {
      index = i;
      score = scores[i] ?? 0;
    }
  }
  return { index, score };
}

/**
 * Lightweight, dependency-free edge detector. It downsamples the capture and
 * looks for the strongest vertical/horizontal luminance transitions in the
 * expected outer regions of the image. It is intentionally conservative: if
 * confidence is low, the user still gets the safe default four-corner frame.
 */
function detectDocumentCorners(source: HTMLCanvasElement): DetectionResult {
  const scale = Math.min(1, DETECTION_DIMENSION / Math.max(source.width, source.height));
  const width = Math.max(32, Math.round(source.width * scale));
  const height = Math.max(32, Math.round(source.height * scale));
  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { corners: defaultCorners(), detected: false };
  ctx.drawImage(source, 0, 0, width, height);

  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return { corners: defaultCorners(), detected: false };
  }

  const luminance = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (pixels[i] * 0.299) + (pixels[i + 1] * 0.587) + (pixels[i + 2] * 0.114);
  };

  const vertical = new Array<number>(width).fill(0);
  const horizontal = new Array<number>(height).fill(0);
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const gx = Math.abs(luminance(x + 1, y) - luminance(x - 1, y));
      const gy = Math.abs(luminance(x, y + 1) - luminance(x, y - 1));
      vertical[x] += gx;
      horizontal[y] += gy;
    }
  }

  const left = findPeak(vertical, Math.max(1, Math.floor(width * 0.02)), Math.floor(width * 0.45));
  const right = findPeak(vertical, Math.ceil(width * 0.55), Math.min(width - 2, Math.floor(width * 0.98)));
  const top = findPeak(horizontal, Math.max(1, Math.floor(height * 0.02)), Math.floor(height * 0.45));
  const bottom = findPeak(horizontal, Math.ceil(height * 0.55), Math.min(height - 2, Math.floor(height * 0.98)));
  const edgeAverage = (average(vertical) + average(horizontal)) / 2;
  const confident =
    right.index - left.index > width * 0.3 &&
    bottom.index - top.index > height * 0.3 &&
    Math.min(left.score, right.score, top.score, bottom.score) > edgeAverage * 1.15;

  if (!confident) return { corners: defaultCorners(), detected: false };
  const inset = 0.002;
  return {
    detected: true,
    corners: [
      { x: clamp(left.index / width - inset, 0, 1), y: clamp(top.index / height - inset, 0, 1) },
      { x: clamp(right.index / width + inset, 0, 1), y: clamp(top.index / height - inset, 0, 1) },
      { x: clamp(left.index / width - inset, 0, 1), y: clamp(bottom.index / height + inset, 0, 1) },
      { x: clamp(right.index / width + inset, 0, 1), y: clamp(bottom.index / height + inset, 0, 1) },
    ],
  };
}

function affineFromTriangles(src: [PixelPoint, PixelPoint, PixelPoint], dst: [PixelPoint, PixelPoint, PixelPoint]) {
  const [p0, p1, p2] = src;
  const [q0, q1, q2] = dst;
  const den = p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y);
  if (Math.abs(den) < 0.00001) throw new Error("Degenerate document corners");
  const a = (q0.x * (p1.y - p2.y) + q1.x * (p2.y - p0.y) + q2.x * (p0.y - p1.y)) / den;
  const c = (q0.x * (p2.x - p1.x) + q1.x * (p0.x - p2.x) + q2.x * (p1.x - p0.x)) / den;
  const e = (q0.x * (p1.x * p2.y - p2.x * p1.y) + q1.x * (p2.x * p0.y - p0.x * p2.y) + q2.x * (p0.x * p1.y - p1.x * p0.y)) / den;
  const b = (q0.y * (p1.y - p2.y) + q1.y * (p2.y - p0.y) + q2.y * (p0.y - p1.y)) / den;
  const d = (q0.y * (p2.x - p1.x) + q1.y * (p0.x - p2.x) + q2.y * (p1.x - p0.x)) / den;
  const f = (q0.y * (p1.x * p2.y - p2.x * p1.y) + q1.y * (p2.x * p0.y - p0.x * p2.y) + q2.y * (p0.x * p1.y - p1.x * p0.y)) / den;
  return { a, b, c, d, e, f };
}

function drawMappedTriangle(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  src: [PixelPoint, PixelPoint, PixelPoint],
  dst: [PixelPoint, PixelPoint, PixelPoint],
) {
  const matrix = affineFromTriangles(src, dst);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dst[0].x, dst[0].y);
  ctx.lineTo(dst[1].x, dst[1].y);
  ctx.lineTo(dst[2].x, dst[2].y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
  ctx.drawImage(source, 0, 0);
  ctx.restore();
}

/** Piecewise-affine four-corner correction. If this fails, caller falls back to a normal crop. */
function perspectiveCrop(source: HTMLCanvasElement, corners: Point[]) {
  const [tlN, trN, blN, brN] = corners;
  const tl = { x: tlN.x * source.width, y: tlN.y * source.height };
  const tr = { x: trN.x * source.width, y: trN.y * source.height };
  const bl = { x: blN.x * source.width, y: blN.y * source.height };
  const br = { x: brN.x * source.width, y: brN.y * source.height };
  const rawWidth = Math.max(1, (distance(tl, tr) + distance(bl, br)) / 2);
  const rawHeight = Math.max(1, (distance(tl, bl) + distance(tr, br)) / 2);
  const scale = Math.min(1, MAX_CAPTURE_DIMENSION / Math.max(rawWidth, rawHeight));
  const width = Math.max(1, Math.round(rawWidth * scale));
  const height = Math.max(1, Math.round(rawHeight * scale));
  if (width < 60 || height < 60) throw new Error("Selected area too small");

  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);

  const srcCenter = { x: (tl.x + tr.x + bl.x + br.x) / 4, y: (tl.y + tr.y + bl.y + br.y) / 4 };
  const dstTl = { x: 0, y: 0 };
  const dstTr = { x: width, y: 0 };
  const dstBl = { x: 0, y: height };
  const dstBr = { x: width, y: height };
  const dstCenter = { x: width / 2, y: height / 2 };
  drawMappedTriangle(ctx, source, [tl, tr, srcCenter], [dstTl, dstTr, dstCenter]);
  drawMappedTriangle(ctx, source, [tr, br, srcCenter], [dstTr, dstBr, dstCenter]);
  drawMappedTriangle(ctx, source, [br, bl, srcCenter], [dstBr, dstBl, dstCenter]);
  drawMappedTriangle(ctx, source, [bl, tl, srcCenter], [dstBl, dstTl, dstCenter]);
  return output;
}

function boundingCrop(source: HTMLCanvasElement, corners: Point[]) {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const left = Math.max(0, Math.min(...xs));
  const right = Math.min(1, Math.max(...xs));
  const top = Math.max(0, Math.min(...ys));
  const bottom = Math.min(1, Math.max(...ys));
  if (right - left < 0.08 || bottom - top < 0.08) throw new Error("Selected area too small");
  const sx = Math.floor(left * source.width);
  const sy = Math.floor(top * source.height);
  const sw = Math.max(1, Math.floor((right - left) * source.width));
  const sh = Math.max(1, Math.floor((bottom - top) * source.height));
  const output = document.createElement("canvas");
  output.width = sw;
  output.height = sh;
  output.getContext("2d")?.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return output;
}

export function DocumentScanner({ open, onClose, onReady }: DocumentScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState<"choice" | "camera" | "adjust" | "preview">("choice");
  const [captured, setCaptured] = useState<HTMLCanvasElement | null>(null);
  const [result, setResult] = useState<HTMLCanvasElement | null>(null);
  const [corners, setCorners] = useState<Point[]>(defaultCorners);
  const [rotation, setRotation] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [previewInfo, setPreviewInfo] = useState<string | null>(null);

  const supportsCamera = useMemo(() => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia), []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function prepareCaptured(canvas: HTMLCanvasElement) {
    const detection = detectDocumentCorners(canvas);
    setCaptured(canvas);
    setCorners(detection.corners);
    setMessage(detection.detected
      ? "Document edges were detected. Adjust the four corners if needed."
      : "We couldn't confidently detect every edge. Adjust the four corners around the document.");
    setStage("adjust");
  }

  useEffect(() => {
    if (!open) {
      stopCamera();
      setStage("choice");
      setCaptured(null);
      setResult(null);
      setCorners(defaultCorners());
      setRotation(0);
      setMessage(null);
      setPreviewInfo(null);
    }
    return () => stopCamera();
  }, [open]);

  async function startCamera(mode = facingMode) {
    setMessage(null);
    if (!supportsCamera) {
      setMessage("Camera scanning isn't available in this browser. You can upload from your device instead.");
      return;
    }
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: mode } }, audio: false });
      streamRef.current = stream;
      setStage("camera");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setMessage("Camera permission was not available. Please allow camera access or upload from your device.");
      setStage("choice");
    }
  }

  async function switchCamera() {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    await startCamera(next);
  }

  function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setMessage("We couldn't capture this image. Please try again.");
      return;
    }
    const scale = Math.min(1, MAX_CAPTURE_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopCamera();
    prepareCaptured(canvas);
  }

  async function loadFile(file: File) {
    if (!file.type.startsWith("image/")) {
      onReady(file);
      onClose();
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setMessage("This image is very large. Please choose a smaller image or take another photo.");
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, MAX_CAPTURE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      prepareCaptured(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setMessage("We couldn't read this image. Please choose another file.");
    };
    image.src = url;
  }

  function updatePreviewCanvas(source: HTMLCanvasElement, rotateDegrees: number) {
    const target = previewRef.current;
    if (!target) return;
    const rotated = Math.abs(rotateDegrees % 180) === 90;
    target.width = rotated ? source.height : source.width;
    target.height = rotated ? source.width : source.height;
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.save();
    ctx.translate(target.width / 2, target.height / 2);
    ctx.rotate((rotateDegrees * Math.PI) / 180);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    ctx.restore();
  }

  useEffect(() => {
    if (stage !== "preview" || !result) return;
    updatePreviewCanvas(result, rotation);
    const target = previewRef.current;
    if (!target) return;
    target.toBlob((blob) => {
      const size = blob ? ` · ~${Math.max(1, Math.round(blob.size / 1024))} KB` : "";
      setPreviewInfo(`${target.width} × ${target.height}px${size}`);
    }, "image/jpeg", 0.9);
  }, [stage, result, rotation]);

  function applyCrop() {
    if (!captured) return;
    try {
      const corrected = perspectiveCrop(captured, corners);
      setResult(corrected);
      setRotation(0);
      setStage("preview");
      setMessage("Perspective correction applied. Check the preview before confirming.");
    } catch {
      try {
        const fallback = boundingCrop(captured, corners);
        setResult(fallback);
        setRotation(0);
        setStage("preview");
        setMessage("Perspective correction wasn't reliable on this image, so NightSafe used a normal crop instead.");
      } catch {
        setMessage("The selected document area is too small. Adjust the corners and try again.");
      }
    }
  }

  async function confirm() {
    const canvas = previewRef.current;
    if (!canvas) return;
    const file = await fileFromCanvas(canvas);
    if (!file) {
      setMessage("We couldn't process this image. Please try taking the photo again.");
      return;
    }
    onReady(file);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Scan document" className="max-w-3xl sm:p-6">
      {message && <p className="mb-3 rounded-input bg-status-waiting/10 p-3 text-sm text-ink">{message}</p>}

      {stage === "choice" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Button size="lg" onClick={() => void startCamera()} icon={<Camera className="h-5 w-5" />} disabled={!supportsCamera}>
            Scan document
          </Button>
          <Button size="lg" variant="secondary" onClick={() => inputRef.current?.click()} icon={<Upload className="h-5 w-5" />}>
            Upload from device
          </Button>
          {!supportsCamera && (
            <div className="sm:col-span-2 flex items-center gap-2 text-sm text-ink/60"><CameraOff className="h-4 w-4" /> Camera capture is unavailable here.</div>
          )}
        </div>
      )}

      {stage === "camera" && (
        <div>
          <video ref={videoRef} playsInline muted className="max-h-[65vh] w-full rounded-card bg-black object-contain" />
          <p className="mt-2 text-center text-sm text-ink/60">Place the document inside the frame and keep it as flat as possible.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => void switchCamera()}>Switch camera</Button>
            <Button size="lg" onClick={capture} icon={<Camera className="h-5 w-5" />}>Capture</Button>
            <Button variant="ghost" onClick={() => { stopCamera(); setStage("choice"); }} icon={<X className="h-4 w-4" />}>Cancel</Button>
          </div>
        </div>
      )}

      {stage === "adjust" && captured && (
        <CornerEditor canvas={captured} corners={corners} onChange={setCorners} />
      )}

      {stage === "adjust" && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => { setCaptured(null); setStage("choice"); setMessage(null); }}>Retake / choose another</Button>
          <Button onClick={applyCrop}>Correct & crop</Button>
        </div>
      )}

      {stage === "preview" && result && (
        <div>
          <div className="max-h-[65vh] overflow-auto rounded-card border border-border bg-sage-50 p-2">
            <canvas ref={previewRef} className="mx-auto max-w-full bg-white shadow-subtle" />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/50">
            <span>{previewInfo ?? "Preparing document preview…"}</span>
            <span>Processing stays on this device until you confirm.</span>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setStage("adjust")}>Adjust corners</Button>
            <Button variant="secondary" onClick={() => setRotation((r) => (r + 90) % 360)} icon={<RotateCw className="h-4 w-4" />}>Rotate</Button>
            <Button variant="secondary" onClick={() => { setResult(null); setStage("choice"); setMessage(null); }}>Retake</Button>
            <Button onClick={() => void confirm()}>Use this scan</Button>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,application/pdf"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void loadFile(file);
          event.currentTarget.value = "";
        }}
      />
    </Modal>
  );
}

function CornerEditor({ canvas, corners, onChange }: { canvas: HTMLCanvasElement; corners: Point[]; onChange: (points: Point[]) => void }) {
  const url = useMemo(() => canvas.toDataURL("image/jpeg", 0.86), [canvas]);

  function move(index: number, event: React.PointerEvent<HTMLButtonElement>) {
    const wrapper = event.currentTarget.parentElement;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const next = [...corners];
    next[index] = {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
    onChange(next);
  }

  return (
    <div>
      <p className="mb-2 text-sm text-ink/60">Adjust the four handles so they sit on the document corners.</p>
      <div className="relative mx-auto max-h-[65vh] max-w-full touch-none overflow-hidden rounded-card bg-black">
        <img src={url} alt="Captured document" className="block max-h-[65vh] w-auto max-w-full select-none" draggable={false} />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon
            points={`${corners[0].x * 100},${corners[0].y * 100} ${corners[1].x * 100},${corners[1].y * 100} ${corners[3].x * 100},${corners[3].y * 100} ${corners[2].x * 100},${corners[2].y * 100}`}
            fill="rgba(255,255,255,.08)" stroke="white" strokeWidth="0.7" strokeDasharray="2 1"
          />
        </svg>
        {corners.map((corner, index) => (
          <button
            key={index}
            aria-label={`Document corner ${index + 1}`}
            className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-4 border-white bg-sage-600 shadow-raised"
            style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
            onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(index, event); }}
            onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          />
        ))}
      </div>
    </div>
  );
}
