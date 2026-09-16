import type { Env, SessionUser } from "../types";
import { putValidatedFile, streamPrivateAttachment } from "./file-security";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

      const stored = await putValidatedFile(env, `agreements/${tenantId}`, file);
      if (!stored.ok) return json({ error: stored.error }, stored.status);

      const id = crypto.randomUUID();
      const auditLogId = crypto.randomUUID();

      try {
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO agreements (id, tenant_id, lease_id, file_key, file_name, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
          ).bind(id, tenantId, leaseId, stored.fileKey, file.name, actor.id),
          env.DB.prepare(
            `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
             VALUES (?, ?, 'DOCUMENT_UPLOADED', 'document', ?, ?)`,
          ).bind(auditLogId, actor.id, id, JSON.stringify({ leaseId, fileName: file.name })),
        ]);
      } catch (error) {
        await env.FILES.delete(stored.fileKey).catch(() => undefined);
        throw error;
      }

      return json({ id, fileName: file.name }, 201);
    },

    /** GET :id/download — streams the file as an attachment, scope-verified via its lease. */
    async download(env: Env, actor: SessionUser, documentId: string): Promise<Response> {
      const doc = await getDocumentById(env, documentId);
      if (!doc || !doc.lease_id || !(await verifyLease(env, actor, doc.lease_id))) {
        return new Response("Not found.", { status: 404 });
      }
      return streamPrivateAttachment(env, doc.file_key, doc.file_name);
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
