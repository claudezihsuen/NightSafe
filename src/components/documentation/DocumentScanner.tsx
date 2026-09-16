import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, RotateCw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface Point { x: number; y: number }
interface DocumentScannerProps {
  open: boolean;
  onClose: () => void;
  onReady: (file: File) => void;
}

const MAX_CAPTURE_DIMENSION = 1800;

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

/**
 * Lightweight browser-only scanner. It intentionally does not send camera
 * frames anywhere. The four-corner UI always lets the user correct the
 * suggested document area; when a robust projective transform is not
 * available, NightSafe falls back to the bounding crop, as required by the
 * product spec.
 */
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

  const supportsCamera = useMemo(() => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia), []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
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
    setCaptured(canvas);
    setCorners(defaultCorners());
    setStage("adjust");
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
      setCaptured(canvas);
      setCorners(defaultCorners());
      setStage("adjust");
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
    ctx.save();
    ctx.translate(target.width / 2, target.height / 2);
    ctx.rotate((rotateDegrees * Math.PI) / 180);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    ctx.restore();
  }

  useEffect(() => {
    if (stage === "preview" && result) updatePreviewCanvas(result, rotation);
  }, [stage, result, rotation]);

  function applyCrop() {
    if (!captured) return;
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const left = Math.max(0, Math.min(...xs));
    const right = Math.min(1, Math.max(...xs));
    const top = Math.max(0, Math.min(...ys));
    const bottom = Math.min(1, Math.max(...ys));
    if (right - left < 0.08 || bottom - top < 0.08) {
      setMessage("The selected document area is too small. Adjust the corners and try again.");
      return;
    }
    // Browser-native fallback crop. The UI exposes all four corners so a
    // future perspective transform can replace this without changing the flow.
    const sx = Math.floor(left * captured.width);
    const sy = Math.floor(top * captured.height);
    const sw = Math.max(1, Math.floor((right - left) * captured.width));
    const sh = Math.max(1, Math.floor((bottom - top) * captured.height));
    const output = document.createElement("canvas");
    output.width = sw;
    output.height = sh;
    output.getContext("2d")?.drawImage(captured, sx, sy, sw, sh, 0, 0, sw, sh);
    setResult(output);
    setRotation(0);
    setStage("preview");
    setMessage(null);
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

  const dimensions = previewRef.current ? `${previewRef.current.width} × ${previewRef.current.height}px` : null;

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
          <Button variant="secondary" onClick={() => { setCaptured(null); setStage("choice"); }}>Retake / choose another</Button>
          <Button onClick={applyCrop}>Confirm crop</Button>
        </div>
      )}

      {stage === "preview" && result && (
        <div>
          <div className="max-h-[65vh] overflow-auto rounded-card border border-border bg-sage-50 p-2">
            <canvas ref={previewRef} className="mx-auto max-w-full bg-white shadow-subtle" />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/50">
            <span>{dimensions ?? "Document preview"}</span>
            <span>Processing stays on this device until you confirm.</span>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setStage("adjust")}>Adjust corners</Button>
            <Button variant="secondary" onClick={() => setRotation((r) => (r + 90) % 360)} icon={<RotateCw className="h-4 w-4" />}>Rotate</Button>
            <Button variant="secondary" onClick={() => { setResult(null); setStage("choice"); }}>Retake</Button>
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
  const imageRef = useRef<HTMLImageElement | null>(null);
  const url = useMemo(() => canvas.toDataURL("image/jpeg", 0.86), [canvas]);

  function move(index: number, event: React.PointerEvent<HTMLButtonElement>) {
    const wrapper = event.currentTarget.parentElement;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const next = [...corners];
    next[index] = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
    onChange(next);
  }

  return (
    <div>
      <p className="mb-2 text-sm text-ink/60">Adjust the four handles so they sit on the document corners.</p>
      <div className="relative mx-auto max-h-[65vh] max-w-full touch-none overflow-hidden rounded-card bg-black">
        <img ref={imageRef} src={url} alt="Captured document" className="block max-h-[65vh] w-auto max-w-full select-none" draggable={false} />
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
            className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-4 border-white bg-sage-600 shadow-raised"
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
