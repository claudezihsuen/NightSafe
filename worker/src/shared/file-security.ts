import type { Env } from "../types";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export type AllowedUploadType = "application/pdf" | "image/png" | "image/jpeg";

const ALLOWED_TYPES = new Set<AllowedUploadType>(["application/pdf", "image/png", "image/jpeg"]);

export interface ValidatedUpload {
  buffer: ArrayBuffer;
  contentType: AllowedUploadType;
  extension: "pdf" | "png" | "jpg";
}

export type UploadValidationResult =
  | { ok: true; upload: ValidatedUpload }
  | { ok: false; error: string; status: number };

export type StoredUploadResult =
  | { ok: true; upload: ValidatedUpload; fileKey: string }
  | { ok: false; error: string; status: number };

function detectType(bytes: Uint8Array): AllowedUploadType | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) return "application/pdf";

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return "image/png";

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

function extensionForType(type: AllowedUploadType): ValidatedUpload["extension"] {
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  return "jpg";
}

export async function validateUploadedFile(file: File, maxBytes = MAX_UPLOAD_BYTES): Promise<UploadValidationResult> {
  if (file.size <= 0) return { ok: false, error: "The file is empty.", status: 400 };
  if (file.size > maxBytes) {
    const mb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    return { ok: false, error: `File must be ${mb}MB or smaller.`, status: 413 };
  }
  if (!ALLOWED_TYPES.has(file.type as AllowedUploadType)) {
    return { ok: false, error: "Only PDF, PNG, and JPG files are allowed.", status: 415 };
  }

  const buffer = await file.arrayBuffer();
  const detected = detectType(new Uint8Array(buffer));
  if (!detected || detected !== file.type) {
    return { ok: false, error: "The uploaded file content does not match its file type.", status: 415 };
  }

  return { ok: true, upload: { buffer, contentType: detected, extension: extensionForType(detected) } };
}

export async function putValidatedFile(
  env: Env,
  prefix: string,
  file: File,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<StoredUploadResult> {
  const result = await validateUploadedFile(file, maxBytes);
  if (!result.ok) return result;

  const fileKey = `${prefix.replace(/\/+$/, "")}/${crypto.randomUUID()}.${result.upload.extension}`;
  await env.FILES.put(fileKey, result.upload.buffer, {
    httpMetadata: { contentType: result.upload.contentType },
  });
  return { ok: true, upload: result.upload, fileKey };
}

function safeFileName(fileName: string): { fallback: string; encoded: string } {
  return {
    fallback: fileName.replace(/[\r\n"\\]/g, "_").replace(/[^\x20-\x7E]/g, "_") || "document",
    encoded: encodeURIComponent(fileName).replace(/['()*]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    ),
  };
}

function disposition(fileName: string, mode: "attachment" | "inline"): string {
  const { fallback, encoded } = safeFileName(fileName);
  return `${mode}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function streamPrivateObject(
  env: Env,
  fileKey: string | null,
  fileName: string,
  mode: "attachment" | "inline",
): Promise<Response> {
  if (!fileKey) return new Response("Not found.", { status: 404 });
  const object = await env.FILES.get(fileKey);
  if (!object) return new Response("Not found.", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": disposition(fileName, mode),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export async function streamPrivateAttachment(
  env: Env,
  fileKey: string | null,
  fileName = "document",
): Promise<Response> {
  return streamPrivateObject(env, fileKey, fileName, "attachment");
}

export async function streamPrivateInline(
  env: Env,
  fileKey: string | null,
  fileName = "document",
): Promise<Response> {
  return streamPrivateObject(env, fileKey, fileName, "inline");
}
