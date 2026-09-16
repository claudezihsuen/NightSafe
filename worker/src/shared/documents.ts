import type { Env, SessionUser } from "../types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

function canonicalDocumentType(bytes: Uint8Array): "application/pdf" | "image/png" | "image/jpeg" | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return "application/pdf";
  }
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
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

function extensionForType(type: string): string {
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  return "jpg";
}

function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[\r\n"\\]/g, "_").replace(/[^\x20-\x7E]/g, "_") || "document";
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export interface DocumentRow {
  id: string;
  tenant_id: string;
  lease_id: string | null;
  file_key: string;
  file_name: string;
  uploaded_by: string;
  uploaded_at: string;
}

export type LeaseScopeCheck = (env: Env, actor: SessionUser, leaseId: string) => Promise<boolean>;

export async function streamDocument(env: Env, fileKey: string, fileName = "document"): Promise<Response> {
  const object = await env.FILES.get(fileKey);
  if (!object) return new Response("Not found.", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": contentDisposition(fileName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

export function createDocumentRoutes(verifyLease: LeaseScopeCheck) {
  async function getLeaseTenantId(env: Env, leaseId: string): Promise<string | null> {
    const row = await env.DB.prepare("SELECT tenant_id FROM leases WHERE id = ?")
      .bind(leaseId)
      .first<{ tenant_id: string }>();
    return row?.tenant_id ?? null;
  }

  async function getDocumentById(env: Env, documentId: string): Promise<DocumentRow | null> {
    const row = await env.DB.prepare("SELECT * FROM agreements WHERE id = ?")
      .bind(documentId)
      .first<DocumentRow>();
    return row ?? null;
  }

  return {
    /** GET — every document uploaded for this lease, newest first. */
    async list(env: Env, actor: SessionUser, leaseId: string): Promise<Response> {
      if (!(await verifyLease(env, actor, leaseId))) return json({ error: "Lease not found." }, 404);

      const { results } = await env.DB.prepare(
        "SELECT * FROM agreements WHERE lease_id = ? ORDER BY uploaded_at DESC",
      )
        .bind(leaseId)
        .all<DocumentRow>();

      return json({ documents: results ?? [] });
    },

    /** POST (multipart/form-data: file) — uploads a new document; does not remove any existing one. */
    async upload(request: Request, env: Env, actor: SessionUser, leaseId: string): Promise<Response> {
      if (!(await verifyLease(env, actor, leaseId))) return json({ error: "Lease not found." }, 404);

      const tenantId = await getLeaseTenantId(env, leaseId);
      if (!tenantId) return json({ error: "Lease not found." }, 404);

      const form = await request.formData().catch(() => null);
      if (!form) return json({ error: "Invalid form data." }, 400);

      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return json({ error: "A file is required." }, 400);
      }
      if (file.size > MAX_DOCUMENT_BYTES) {
        return json({ error: "File must be 10MB or smaller." }, 413);
      }
      if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) {
        return json({ error: "Only PDF, PNG, and JPG files are allowed." }, 415);
      }

      const buffer = await file.arrayBuffer();
      const verifiedType = canonicalDocumentType(new Uint8Array(buffer));
      if (!verifiedType || verifiedType !== file.type) {
        return json({ error: "The uploaded file content does not match its file type." }, 415);
      }

      const id = crypto.randomUUID();
      const fileKey = `agreements/${tenantId}/${id}.${extensionForType(verifiedType)}`;
      await env.FILES.put(fileKey, buffer, {
        httpMetadata: { contentType: verifiedType },
      });

      const auditLogId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO agreements (id, tenant_id, lease_id, file_key, file_name, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(id, tenantId, leaseId, fileKey, file.name, actor.id),
        env.DB.prepare(
          `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
           VALUES (?, ?, 'DOCUMENT_UPLOADED', 'document', ?, ?)`,
        ).bind(auditLogId, actor.id, id, JSON.stringify({ leaseId, fileName: file.name })),
      ]);

      return json({ id, fileName: file.name }, 201);
    },

    /** GET :id/download — streams the file as an attachment, scope-verified via its lease. */
    async download(env: Env, actor: SessionUser, documentId: string): Promise<Response> {
      const doc = await getDocumentById(env, documentId);
      if (!doc || !doc.lease_id || !(await verifyLease(env, actor, doc.lease_id))) {
        return new Response("Not found.", { status: 404 });
      }
      return streamDocument(env, doc.file_key, doc.file_name);
    },

    /** DELETE :id — removes the D1 row and the R2 object. No soft-delete/versioning exists yet, so this is permanent. */
    async remove(env: Env, actor: SessionUser, documentId: string): Promise<Response> {
      const doc = await getDocumentById(env, documentId);
      if (!doc || !doc.lease_id || !(await verifyLease(env, actor, doc.lease_id))) {
        return json({ error: "Document not found." }, 404);
      }

      const auditLogId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("DELETE FROM agreements WHERE id = ?").bind(documentId),
        env.DB.prepare(
          `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
           VALUES (?, ?, 'DOCUMENT_DELETED', 'document', ?, ?)`,
        ).bind(auditLogId, actor.id, documentId, JSON.stringify({ leaseId: doc.lease_id, fileName: doc.file_name })),
      ]);

      await env.FILES.delete(doc.file_key).catch(() => {
        // D1 row is already gone; a stray R2 object with no reference is a
        // storage-cost issue, not a data-integrity or security one — don't
        // fail the request over it.
      });

      return json({ ok: true });
    },
  };
}
