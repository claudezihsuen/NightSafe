import type { Env, SessionUser } from "../types";
import { putValidatedFile, streamPrivateAttachment, streamPrivateInline } from "../shared/file-security";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const DOC_STATUSES = new Set([
  "REQUIRED",
  "NOT_UPLOADED",
  "UPLOADED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "ARCHIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "REVISION_REQUIRED",
]);
const FIELD_TYPES = new Set(["TEXT", "DATE", "SIGNATURE", "CHECKBOX", "INITIALS"]);
const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);
const DEFAULT_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 1024 * 1024;

interface DocumentRow {
  id: string;
  tenant_id: string;
  lease_id: string;
  property_id: string | null;
  unit_id: string | null;
  name: string;
  category: string | null;
  description: string | null;
  internal_notes: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  object_key: string | null;
  uploaded_by: string | null;
  uploaded_at: string | null;
  updated_at: string;
  status: string;
  tenant_visible: number;
  tenant_download: number;
  tenant_upload: number;
  tenant_can_edit: number;
  tenant_can_sign: number;
  required: number;
  expiry_date: string | null;
  allowed_types: string;
  max_file_size: number;
  current_version: number;
  archived_at: string | null;
  created_at: string;
}

interface FieldRow {
  id: string;
  document_id: string;
  version_number: number;
  field_type: string;
  label: string;
  required: number;
  assigned_role: string;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sort_order: number;
}

interface ValueRow {
  field_id: string;
  value_text: string | null;
  value_checked: number | null;
  signature_key: string | null;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function cleanTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_TYPES;
  const list = value.filter((item): item is string => typeof item === "string" && ALLOWED_MIME.has(item));
  return list.length ? [...new Set(list)] : DEFAULT_TYPES;
}

function parseTypes(raw: string): string[] {
  try {
    return cleanTypes(JSON.parse(raw));
  } catch {
    return DEFAULT_TYPES;
  }
}

async function getDocument(env: Env, id: string): Promise<DocumentRow | null> {
  return (
    (await env.DB.prepare("SELECT * FROM documents WHERE id = ?").bind(id).first<DocumentRow>()) ?? null
  );
}

async function canManageLease(env: Env, actor: SessionUser, leaseId: string): Promise<boolean> {
  if (actor.role === "OWNER") {
    const row = await env.DB.prepare(
      `SELECT l.id FROM leases l
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE l.id = ? AND p.owner_id = ?`,
    ).bind(leaseId, actor.id).first();
    return Boolean(row);
  }
  if (actor.role === "AGENT") {
    const row = await env.DB.prepare(
      `SELECT l.id FROM leases l
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE l.id = ? AND EXISTS (
         SELECT 1 FROM agent_assignments aa
         WHERE aa.agent_id = ? AND aa.property_id = p.id
           AND (aa.unit_id IS NULL OR aa.unit_id = u.id)
       )`,
    ).bind(leaseId, actor.id).first();
    return Boolean(row);
  }
  return false;
}

async function canManageDocument(env: Env, actor: SessionUser, doc: DocumentRow): Promise<boolean> {
  return canManageLease(env, actor, doc.lease_id);
}

async function canTenantAccess(env: Env, actor: SessionUser, doc: DocumentRow): Promise<boolean> {
  if (actor.role !== "TENANT" || doc.tenant_id !== actor.id || !doc.tenant_visible || doc.archived_at) return false;
  const row = await env.DB.prepare(
    "SELECT id FROM leases WHERE id = ? AND tenant_id = ? AND status = 'ACTIVE'",
  ).bind(doc.lease_id, actor.id).first();
  return Boolean(row);
}

function effectiveStatus(doc: DocumentRow): string {
  if (doc.status === "ARCHIVED" || doc.archived_at) return "ARCHIVED";
  if (doc.expiry_date && doc.expiry_date < new Date().toISOString().slice(0, 10) && doc.status !== "COMPLETED") {
    return "EXPIRED";
  }
  return doc.status;
}

function publicDocument(doc: DocumentRow, manager: boolean) {
  const base = {
    id: doc.id,
    tenantId: doc.tenant_id,
    leaseId: doc.lease_id,
    propertyId: doc.property_id,
    unitId: doc.unit_id,
    name: doc.name,
    category: doc.category,
    description: doc.description,
    fileName: doc.file_name,
    fileType: doc.file_type,
    fileSize: doc.file_size,
    uploadedAt: doc.uploaded_at,
    updatedAt: doc.updated_at,
    status: effectiveStatus(doc),
    tenantVisible: Boolean(doc.tenant_visible),
    tenantDownload: Boolean(doc.tenant_download),
    tenantUpload: Boolean(doc.tenant_upload),
    tenantCanEdit: Boolean(doc.tenant_can_edit),
    tenantCanSign: Boolean(doc.tenant_can_sign),
    required: Boolean(doc.required),
    expiryDate: doc.expiry_date,
    allowedTypes: parseTypes(doc.allowed_types),
    maxFileSize: doc.max_file_size,
    currentVersion: doc.current_version,
    hasFile: Boolean(doc.object_key),
    archivedAt: doc.archived_at,
    createdAt: doc.created_at,
  };
  return manager ? { ...base, internalNotes: doc.internal_notes, uploadedBy: doc.uploaded_by } : base;
}

async function event(env: Env, docId: string, actor: SessionUser, action: string, metadata?: unknown) {
  await env.DB.prepare(
    `INSERT INTO document_events (id, document_id, actor_id, actor_role, action, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    docId,
    actor.id,
    actor.role,
    action,
    metadata == null ? null : JSON.stringify(metadata),
  ).run();
}

async function notify(
  env: Env,
  userId: string,
  title: string,
  body: string,
  type: string,
  relatedId: string,
  href: string,
  dedupeKey: string,
) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO notifications
       (id, user_id, title, body, type, related_type, related_id, href, dedupe_key)
     VALUES (?, ?, ?, ?, ?, 'document', ?, ?, ?)`,
  ).bind(crypto.randomUUID(), userId, title, body, type, relatedId, href, dedupeKey).run();
}

async function managerTenancies(env: Env, actor: SessionUser) {
  const base = `SELECT l.id AS leaseId, l.status, l.start_date AS startDate, l.end_date AS endDate,
      t.id AS tenantId, t.name AS tenantName, t.email AS tenantEmail,
      p.id AS propertyId, p.name AS propertyName,
      u.id AS unitId, u.label AS unitLabel
    FROM leases l
    JOIN users t ON t.id = l.tenant_id
    JOIN units u ON u.id = l.unit_id
    JOIN properties p ON p.id = u.property_id`;
  if (actor.role === "OWNER") {
    const { results } = await env.DB.prepare(`${base} WHERE p.owner_id = ? ORDER BY l.created_at DESC`)
      .bind(actor.id).all();
    return results ?? [];
  }
  const { results } = await env.DB.prepare(
    `${base} WHERE EXISTS (
       SELECT 1 FROM agent_assignments aa
       WHERE aa.agent_id = ? AND aa.property_id = p.id
         AND (aa.unit_id IS NULL OR aa.unit_id = u.id)
     ) ORDER BY l.created_at DESC`,
  ).bind(actor.id).all();
  return results ?? [];
}

async function listManager(env: Env, actor: SessionUser): Promise<Response> {
  const where = actor.role === "OWNER"
    ? "p.owner_id = ?"
    : `EXISTS (SELECT 1 FROM agent_assignments aa WHERE aa.agent_id = ? AND aa.property_id = p.id AND (aa.unit_id IS NULL OR aa.unit_id = u.id))`;
  const { results } = await env.DB.prepare(
    `SELECT d.*, t.name AS tenant_name, t.email AS tenant_email,
            p.name AS property_name, u.label AS unit_label
     FROM documents d
     JOIN leases l ON l.id = d.lease_id
     JOIN users t ON t.id = d.tenant_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE ${where}
     ORDER BY d.updated_at DESC`,
  ).bind(actor.id).all<DocumentRow & { tenant_name: string; tenant_email: string; property_name: string; unit_label: string }>();

  return json({
    documents: (results ?? []).map((d) => ({
      ...publicDocument(d, true),
      tenantName: d.tenant_name,
      tenantEmail: d.tenant_email,
      propertyName: d.property_name,
      unitLabel: d.unit_label,
    })),
    tenancies: await managerTenancies(env, actor),
  });
}

async function listTenant(env: Env, actor: SessionUser): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT d.*, p.name AS property_name, u.label AS unit_label
     FROM documents d
     JOIN leases l ON l.id = d.lease_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE d.tenant_id = ? AND l.status = 'ACTIVE' AND d.tenant_visible = 1 AND d.archived_at IS NULL
     ORDER BY COALESCE(d.category, 'Other'), d.required DESC, d.updated_at DESC`,
  ).bind(actor.id).all<DocumentRow & { property_name: string; unit_label: string }>();
  return json({
    documents: (results ?? []).map((d) => ({
      ...publicDocument(d, false),
      propertyName: d.property_name,
      unitLabel: d.unit_label,
    })),
  });
}

async function createRequirement(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const body = await request.json().catch(() => null);
  const leaseId = typeof body?.leaseId === "string" ? body.leaseId : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!leaseId || !name) return json({ error: "Tenancy and document name are required." }, 400);
  if (!(await canManageLease(env, actor, leaseId))) return json({ error: "Tenancy not found." }, 404);

  const tenancy = await env.DB.prepare(
    `SELECT l.tenant_id, u.id AS unit_id, p.id AS property_id
     FROM leases l JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id
     WHERE l.id = ?`,
  ).bind(leaseId).first<{ tenant_id: string; unit_id: string; property_id: string }>();
  if (!tenancy) return json({ error: "Tenancy not found." }, 404);

  const required = asBool(body?.required);
  const tenantUpload = asBool(body?.tenantUpload);
  const tenantVisible = body?.tenantVisible === false ? false : true;
  const tenantDownload = body?.tenantDownload === false ? false : true;
  const tenantCanEdit = asBool(body?.tenantCanEdit);
  const tenantCanSign = tenantCanEdit || asBool(body?.tenantCanSign);
  const allowedTypes = cleanTypes(body?.allowedTypes);
  const maxMb = clampInt(body?.maxFileSizeMb, 1, 10, 10);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO documents (
        id, tenant_id, lease_id, property_id, unit_id, name, category, description, internal_notes,
        status, tenant_visible, tenant_download, tenant_upload, tenant_can_edit, tenant_can_sign,
        required, expiry_date, allowed_types, max_file_size, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      tenancy.tenant_id,
      leaseId,
      tenancy.property_id,
      tenancy.unit_id,
      name,
      typeof body?.category === "string" && body.category.trim() ? body.category.trim() : null,
      typeof body?.description === "string" && body.description.trim() ? body.description.trim() : null,
      typeof body?.internalNotes === "string" && body.internalNotes.trim() ? body.internalNotes.trim() : null,
      required ? "REQUIRED" : "NOT_UPLOADED",
      tenantVisible ? 1 : 0,
      tenantDownload ? 1 : 0,
      tenantUpload ? 1 : 0,
      tenantCanEdit ? 1 : 0,
      tenantCanSign ? 1 : 0,
      required ? 1 : 0,
      typeof body?.expiryDate === "string" && body.expiryDate ? body.expiryDate : null,
      JSON.stringify(allowedTypes),
      maxMb * 1024 * 1024,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO document_events (id, document_id, actor_id, actor_role, action, metadata)
       VALUES (?, ?, ?, ?, 'CREATED', ?)`,
    ).bind(crypto.randomUUID(), id, actor.id, actor.role, JSON.stringify({ leaseId, required, tenantUpload })),
  ]);

  if (tenantVisible) {
    await notify(
      env,
      tenancy.tenant_id,
      required ? "Document required" : "Documentation updated",
      required ? `${name} is waiting for your upload.` : `${name} is now listed in Documentation.`,
      "AGREEMENT_AVAILABLE",
      id,
      "/tenant/documentation",
      `document-created:${id}`,
    );
  }

  const doc = await getDocument(env, id);
  return json({ document: doc ? publicDocument(doc, true) : { id } }, 201);
}

async function updateMetadata(request: Request, env: Env, actor: SessionUser, doc: DocumentRow): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid request." }, 400);

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : doc.name;
  const category = body.category === null ? null : typeof body.category === "string" ? body.category.trim() || null : doc.category;
  const description = body.description === null ? null : typeof body.description === "string" ? body.description.trim() || null : doc.description;
  const internalNotes = body.internalNotes === null ? null : typeof body.internalNotes === "string" ? body.internalNotes.trim() || null : doc.internal_notes;
  const required = typeof body.required === "boolean" ? body.required : Boolean(doc.required);
  const tenantVisible = typeof body.tenantVisible === "boolean" ? body.tenantVisible : Boolean(doc.tenant_visible);
  const tenantDownload = typeof body.tenantDownload === "boolean" ? body.tenantDownload : Boolean(doc.tenant_download);
  const tenantUpload = typeof body.tenantUpload === "boolean" ? body.tenantUpload : Boolean(doc.tenant_upload);
  const tenantCanEdit = typeof body.tenantCanEdit === "boolean" ? body.tenantCanEdit : Boolean(doc.tenant_can_edit);
  const tenantCanSign = tenantCanEdit || (typeof body.tenantCanSign === "boolean" ? body.tenantCanSign : Boolean(doc.tenant_can_sign));
  const allowedTypes = body.allowedTypes == null ? parseTypes(doc.allowed_types) : cleanTypes(body.allowedTypes);
  const maxBytes = body.maxFileSizeMb == null ? doc.max_file_size : clampInt(body.maxFileSizeMb, 1, 10, 10) * 1024 * 1024;
  const expiryDate = body.expiryDate === null ? null : typeof body.expiryDate === "string" ? body.expiryDate || null : doc.expiry_date;
  const requestedStatus = typeof body.status === "string" && DOC_STATUSES.has(body.status) ? body.status : doc.status;
  const status = requestedStatus === "ARCHIVED" ? doc.status : requestedStatus;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE documents SET name=?, category=?, description=?, internal_notes=?, required=?, tenant_visible=?,
       tenant_download=?, tenant_upload=?, tenant_can_edit=?, tenant_can_sign=?, allowed_types=?, max_file_size=?,
       expiry_date=?, status=?, updated_at=? WHERE id=?`,
  ).bind(
    name, category, description, internalNotes, required ? 1 : 0, tenantVisible ? 1 : 0,
    tenantDownload ? 1 : 0, tenantUpload ? 1 : 0, tenantCanEdit ? 1 : 0, tenantCanSign ? 1 : 0,
    JSON.stringify(allowedTypes), maxBytes, expiryDate, status, now, doc.id,
  ).run();
  await event(env, doc.id, actor, "METADATA_UPDATED", { status, tenantVisible, tenantDownload, tenantUpload });

  if (tenantVisible && !doc.tenant_visible) {
    await notify(env, doc.tenant_id, "Document available", `${name} is now available in Documentation.`, "AGREEMENT_AVAILABLE", doc.id, "/tenant/documentation", `document-visible:${doc.id}:${now.slice(0, 10)}`);
  }

  return json({ document: publicDocument((await getDocument(env, doc.id))!, true) });
}

async function replaceFile(request: Request, env: Env, actor: SessionUser, doc: DocumentRow, isTenant: boolean): Promise<Response> {
  if (doc.archived_at || doc.status === "ARCHIVED") return json({ error: "Archived documents cannot be changed." }, 409);
  if (isTenant) {
    if (!doc.tenant_upload) return json({ error: "Tenant upload is not enabled for this document." }, 403);
    if (doc.status === "COMPLETED") return json({ error: "Completed documents are locked." }, 409);
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size <= 0) return json({ error: "A file is required." }, 400);

  const stored = await putValidatedFile(env, `documentation/${doc.tenant_id}/${doc.id}`, file, Math.min(doc.max_file_size, MAX_DOC_BYTES));
  if (!stored.ok) return json({ error: stored.error }, stored.status);
  const allowed = parseTypes(doc.allowed_types);
  if (!allowed.includes(stored.upload.contentType)) {
    await env.FILES.delete(stored.fileKey).catch(() => undefined);
    return json({ error: "This file type is not allowed for this document." }, 415);
  }

  const nextVersion = Math.max(1, doc.current_version + 1);
  const now = new Date().toISOString();
  const status = isTenant ? "UNDER_REVIEW" : "UPLOADED";

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO document_versions
         (id, document_id, version_number, file_name, file_type, file_size, object_key, uploaded_by, source, uploaded_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), doc.id, nextVersion, file.name, stored.upload.contentType, file.size,
        stored.fileKey, actor.id, actor.role, now, JSON.stringify({ replacedVersion: doc.current_version || null }),
      ),
      env.DB.prepare(
        `UPDATE documents SET file_name=?, file_type=?, file_size=?, object_key=?, uploaded_by=?, uploaded_at=?,
         updated_at=?, current_version=?, status=? WHERE id=?`,
      ).bind(file.name, stored.upload.contentType, file.size, stored.fileKey, actor.id, now, now, nextVersion, status, doc.id),
      env.DB.prepare(
        `INSERT INTO document_events (id, document_id, actor_id, actor_role, action, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), doc.id, actor.id, actor.role, isTenant ? "TENANT_UPLOADED" : "UPLOADED", JSON.stringify({ version: nextVersion, fileName: file.name })),
    ]);
  } catch (error) {
    await env.FILES.delete(stored.fileKey).catch(() => undefined);
    throw error;
  }

  if (!isTenant && doc.tenant_visible) {
    await notify(env, doc.tenant_id, "Document available", `${doc.name} has been updated.`, "AGREEMENT_AVAILABLE", doc.id, "/tenant/documentation", `document-file:${doc.id}:${nextVersion}`);
  }

  return json({ document: publicDocument((await getDocument(env, doc.id))!, !isTenant), version: nextVersion }, 201);
}

async function listFields(env: Env, docId: string, version: number): Promise<FieldRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, document_id, version_number, field_type, label, required, assigned_role, page_number,
            x, y, width, height, sort_order
     FROM document_fields WHERE document_id = ? AND version_number = ? ORDER BY sort_order, created_at`,
  ).bind(docId, version).all<FieldRow>();
  return results ?? [];
}

async function getValues(env: Env, docId: string, version: number, tenantId: string): Promise<ValueRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT field_id, value_text, value_checked, signature_key
     FROM document_field_values WHERE document_id=? AND version_number=? AND tenant_id=?`,
  ).bind(docId, version, tenantId).all<ValueRow>();
  return results ?? [];
}

async function managerDetail(env: Env, actor: SessionUser, doc: DocumentRow): Promise<Response> {
  const fields = await listFields(env, doc.id, doc.current_version);
  const { results: versions } = await env.DB.prepare(
    `SELECT version_number, file_name, file_type, file_size, uploaded_by, source, uploaded_at, metadata_json
     FROM document_versions WHERE document_id=? ORDER BY version_number DESC`,
  ).bind(doc.id).all();
  const { results: submissions } = await env.DB.prepare(
    `SELECT id, version_number, status, completed_at, completed_by, reopened_at, reopened_by, reopen_reason, created_at
     FROM document_submissions WHERE document_id=? ORDER BY version_number DESC, created_at DESC`,
  ).bind(doc.id).all();
  const values = doc.current_version > 0 ? await getValues(env, doc.id, doc.current_version, doc.tenant_id) : [];
  return json({ document: publicDocument(doc, true), fields, values, versions: versions ?? [], submissions: submissions ?? [] });
}

async function tenantDetail(env: Env, actor: SessionUser, doc: DocumentRow): Promise<Response> {
  const fields = doc.current_version > 0 ? await listFields(env, doc.id, doc.current_version) : [];
  const values = doc.current_version > 0 ? await getValues(env, doc.id, doc.current_version, actor.id) : [];
  const latest = await env.DB.prepare(
    `SELECT version_number, status, completed_at, created_at
     FROM document_submissions WHERE document_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 1`,
  ).bind(doc.id, actor.id).first();
  await event(env, doc.id, actor, "OPENED", { version: doc.current_version });
  return json({ document: publicDocument(doc, false), fields, values, submission: latest ?? null });
}

async function replaceFields(request: Request, env: Env, actor: SessionUser, doc: DocumentRow): Promise<Response> {
  if (!doc.current_version || !doc.object_key) return json({ error: "Upload a document before placing fields." }, 409);
  if (doc.status === "COMPLETED") return json({ error: "Completed documents must be reopened before field changes." }, 409);

  const existingValue = await env.DB.prepare(
    "SELECT id FROM document_field_values WHERE document_id=? AND version_number=? LIMIT 1",
  ).bind(doc.id, doc.current_version).first();
  if (existingValue) return json({ error: "Field layout is locked after the tenant starts completing this version." }, 409);

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.fields)) return json({ error: "Fields are required." }, 400);
  if (body.fields.length > 100) return json({ error: "A document can contain at most 100 fields." }, 400);

  const statements: D1PreparedStatement[] = [
    env.DB.prepare("DELETE FROM document_fields WHERE document_id=? AND version_number=?").bind(doc.id, doc.current_version),
  ];
  const responseFields: FieldRow[] = [];
  for (let i = 0; i < body.fields.length; i += 1) {
    const raw = body.fields[i];
    const type = typeof raw?.fieldType === "string" ? raw.fieldType.toUpperCase() : "";
    const label = typeof raw?.label === "string" ? raw.label.trim() : "";
    if (!FIELD_TYPES.has(type) || !label) return json({ error: `Field ${i + 1} is invalid.` }, 400);
    const x = Number(raw.x), y = Number(raw.y), width = Number(raw.width), height = Number(raw.height);
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.001 || y + height > 1.001) {
      return json({ error: `Field ${i + 1} is outside the document.` }, 400);
    }
    const id = crypto.randomUUID();
    const row: FieldRow = {
      id, document_id: doc.id, version_number: doc.current_version, field_type: type, label,
      required: asBool(raw.required) ? 1 : 0, assigned_role: "TENANT", page_number: clampInt(raw.pageNumber, 1, 999, 1),
      x, y, width, height, sort_order: i,
    };
    responseFields.push(row);
    statements.push(env.DB.prepare(
      `INSERT INTO document_fields
       (id, document_id, version_number, field_type, label, required, assigned_role, page_number, x, y, width, height, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'TENANT', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, doc.id, doc.current_version, type, label, row.required, row.page_number, x, y, width, height, i, actor.id));
  }
  await env.DB.batch(statements);
  await event(env, doc.id, actor, "FIELDS_CONFIGURED", { version: doc.current_version, count: responseFields.length });
  return json({ fields: responseFields });
}

function fieldInteractive(doc: DocumentRow, field: FieldRow): boolean {
  if (doc.tenant_can_edit) return true;
  if (doc.tenant_can_sign && (field.field_type === "SIGNATURE" || field.field_type === "INITIALS")) return true;
  return false;
}

async function saveProgress(request: Request, env: Env, actor: SessionUser, doc: DocumentRow): Promise<Response> {
  if (doc.status === "COMPLETED" || doc.status === "ARCHIVED") return json({ error: "This document is locked." }, 409);
  if (!doc.tenant_can_edit && !doc.tenant_can_sign) return json({ error: "This document is read-only." }, 403);
  const body = await request.json().catch(() => null);
  if (Number(body?.version) !== doc.current_version || !Array.isArray(body?.values)) return json({ error: "Document version changed. Refresh and try again." }, 409);

  const fields = await listFields(env, doc.id, doc.current_version);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const statements: D1PreparedStatement[] = [];
  const now = new Date().toISOString();
  for (const raw of body.values) {
    const fieldId = typeof raw?.fieldId === "string" ? raw.fieldId : "";
    const field = byId.get(fieldId);
    if (!field || !fieldInteractive(doc, field) || field.field_type === "SIGNATURE" || field.field_type === "INITIALS") continue;
    const valueText = field.field_type === "CHECKBOX" ? null : typeof raw?.value === "string" ? raw.value.slice(0, 2000) : "";
    const checked = field.field_type === "CHECKBOX" ? (raw?.checked === true ? 1 : 0) : null;
    statements.push(env.DB.prepare(
      `INSERT INTO document_field_values
       (id, document_id, version_number, tenant_id, field_id, value_text, value_checked, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(document_id, version_number, tenant_id, field_id)
       DO UPDATE SET value_text=excluded.value_text, value_checked=excluded.value_checked, updated_at=excluded.updated_at`,
    ).bind(crypto.randomUUID(), doc.id, doc.current_version, actor.id, field.id, valueText, checked, now));
  }
  statements.push(env.DB.prepare(
    `UPDATE documents SET status=CASE WHEN status IN ('REVISION_REQUIRED','IN_PROGRESS') THEN status ELSE 'IN_PROGRESS' END, updated_at=? WHERE id=?`,
  ).bind(now, doc.id));
  if (statements.length) await env.DB.batch(statements);
  await event(env, doc.id, actor, "SAVED", { version: doc.current_version });
  return json({ ok: true, status: doc.status === "REVISION_REQUIRED" ? "REVISION_REQUIRED" : "IN_PROGRESS" });
}

async function saveSignature(request: Request, env: Env, actor: SessionUser, doc: DocumentRow): Promise<Response> {
  if (doc.status === "COMPLETED" || doc.status === "ARCHIVED") return json({ error: "This document is locked." }, 409);
  const form = await request.formData().catch(() => null);
  const fieldId = typeof form?.get("fieldId") === "string" ? String(form!.get("fieldId")) : "";
  const version = Number(form?.get("version"));
  const file = form?.get("file");
  if (!fieldId || version !== doc.current_version || !(file instanceof File)) return json({ error: "Invalid signature submission." }, 400);

  const field = (await listFields(env, doc.id, doc.current_version)).find((f) => f.id === fieldId);
  if (!field || !fieldInteractive(doc, field) || !["SIGNATURE", "INITIALS"].includes(field.field_type)) {
    return json({ error: "Signature field not available." }, 403);
  }
  if (!doc.tenant_can_edit && !doc.tenant_can_sign) return json({ error: "Signing is not enabled." }, 403);

  const stored = await putValidatedFile(env, `documentation/${actor.id}/${doc.id}/signatures`, file, MAX_SIGNATURE_BYTES);
  if (!stored.ok) return json({ error: stored.error }, stored.status);
  if (!stored.upload.contentType.startsWith("image/")) {
    await env.FILES.delete(stored.fileKey).catch(() => undefined);
    return json({ error: "Signature must be an image." }, 415);
  }

  const old = await env.DB.prepare(
    `SELECT signature_key FROM document_field_values
     WHERE document_id=? AND version_number=? AND tenant_id=? AND field_id=?`,
  ).bind(doc.id, doc.current_version, actor.id, field.id).first<{ signature_key: string | null }>();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO document_field_values
       (id, document_id, version_number, tenant_id, field_id, signature_key, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(document_id, version_number, tenant_id, field_id)
       DO UPDATE SET signature_key=excluded.signature_key, updated_at=excluded.updated_at`,
    ).bind(crypto.randomUUID(), doc.id, doc.current_version, actor.id, field.id, stored.fileKey, now),
    env.DB.prepare(
      `UPDATE documents SET status=CASE WHEN status='REVISION_REQUIRED' THEN status ELSE 'IN_PROGRESS' END, updated_at=? WHERE id=?`,
    ).bind(now, doc.id),
  ]);
  if (old?.signature_key && old.signature_key !== stored.fileKey) await env.FILES.delete(old.signature_key).catch(() => undefined);
  await event(env, doc.id, actor, "SIGNATURE_SAVED", { version: doc.current_version, fieldId: field.id });
  return json({ ok: true });
}

async function submitCompletion(env: Env, actor: SessionUser, doc: DocumentRow): Promise<Response> {
  if (doc.status === "COMPLETED" || doc.status === "ARCHIVED") return json({ error: "This document is locked." }, 409);
  const fields = await listFields(env, doc.id, doc.current_version);
  const values = await getValues(env, doc.id, doc.current_version, actor.id);
  const byField = new Map(values.map((v) => [v.field_id, v]));
  const missing: string[] = [];
  for (const field of fields) {
    if (!field.required) continue;
    const value = byField.get(field.id);
    const complete = field.field_type === "SIGNATURE" || field.field_type === "INITIALS"
      ? Boolean(value?.signature_key)
      : field.field_type === "CHECKBOX"
        ? value?.value_checked === 1
        : Boolean(value?.value_text?.trim());
    if (!complete) missing.push(field.label);
  }
  if (missing.length) return json({ error: "Please complete all required fields.", missing }, 409);

  const snapshot = fields.map((field) => {
    const value = byField.get(field.id);
    return {
      fieldId: field.id,
      label: field.label,
      type: field.field_type,
      value: value?.value_text ?? null,
      checked: value?.value_checked === 1,
      signed: Boolean(value?.signature_key),
    };
  });
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO document_submissions
       (id, document_id, version_number, tenant_id, status, values_json, completed_at, completed_by)
       VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?)`,
    ).bind(crypto.randomUUID(), doc.id, doc.current_version, actor.id, JSON.stringify(snapshot), now, actor.id),
    env.DB.prepare("UPDATE documents SET status='COMPLETED', updated_at=? WHERE id=?").bind(now, doc.id),
  ]);
  await event(env, doc.id, actor, "COMPLETED", { version: doc.current_version });
  return json({ ok: true, status: "COMPLETED", completedAt: now });
}

async function reopen(request: Request, env: Env, actor: SessionUser, doc: DocumentRow): Promise<Response> {
  if (doc.status !== "COMPLETED") return json({ error: "Only completed documents can be reopened." }, 409);
  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;
  const oldVersion = doc.current_version;
  const newVersion = oldVersion + 1;
  const fields = await listFields(env, doc.id, oldVersion);
  const values = await getValues(env, doc.id, oldVersion, doc.tenant_id);
  const valueByOldField = new Map(values.map((v) => [v.field_id, v]));
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO document_versions
       (id, document_id, version_number, file_name, file_type, file_size, object_key, uploaded_by, source, uploaded_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REOPEN_COPY', ?, ?)`,
    ).bind(crypto.randomUUID(), doc.id, newVersion, doc.file_name, doc.file_type, doc.file_size, doc.object_key, actor.id, now, JSON.stringify({ reopenedFromVersion: oldVersion })),
    env.DB.prepare("UPDATE documents SET current_version=?, status='REVISION_REQUIRED', updated_at=? WHERE id=?")
      .bind(newVersion, now, doc.id),
    env.DB.prepare(
      `INSERT INTO document_submissions
       (id, document_id, version_number, tenant_id, status, values_json, reopened_at, reopened_by, reopen_reason)
       VALUES (?, ?, ?, ?, 'REVISION_REQUIRED', '[]', ?, ?, ?)`,
    ).bind(crypto.randomUUID(), doc.id, newVersion, doc.tenant_id, now, actor.id, reason),
  ];

  for (const field of fields) {
    const newFieldId = crypto.randomUUID();
    statements.push(env.DB.prepare(
      `INSERT INTO document_fields
       (id, document_id, version_number, field_type, label, required, assigned_role, page_number, x, y, width, height, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'TENANT', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(newFieldId, doc.id, newVersion, field.field_type, field.label, field.required, field.page_number, field.x, field.y, field.width, field.height, field.sort_order, actor.id));
    const oldValue = valueByOldField.get(field.id);
    if (oldValue && field.field_type !== "SIGNATURE" && field.field_type !== "INITIALS") {
      statements.push(env.DB.prepare(
        `INSERT INTO document_field_values
         (id, document_id, version_number, tenant_id, field_id, value_text, value_checked, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), doc.id, newVersion, doc.tenant_id, newFieldId, oldValue.value_text, oldValue.value_checked, now));
    }
  }
  await env.DB.batch(statements);
  await event(env, doc.id, actor, "REOPENED", { fromVersion: oldVersion, version: newVersion, reason });
  await notify(env, doc.tenant_id, "Document needs correction", `${doc.name} has been reopened for correction.`, "AGREEMENT_AVAILABLE", doc.id, "/tenant/documentation", `document-reopen:${doc.id}:${newVersion}`);
  return json({ ok: true, version: newVersion, status: "REVISION_REQUIRED" });
}

async function archive(env: Env, actor: SessionUser, doc: DocumentRow): Promise<Response> {
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE documents SET status='ARCHIVED', archived_at=?, updated_at=? WHERE id=?")
    .bind(now, now, doc.id).run();
  await event(env, doc.id, actor, "ARCHIVED");
  return json({ ok: true });
}

async function remove(env: Env, actor: SessionUser, doc: DocumentRow): Promise<Response> {
  const { results: versions } = await env.DB.prepare(
    "SELECT object_key FROM document_versions WHERE document_id=? AND object_key IS NOT NULL",
  ).bind(doc.id).all<{ object_key: string }>();
  const { results: signatures } = await env.DB.prepare(
    "SELECT signature_key FROM document_field_values WHERE document_id=? AND signature_key IS NOT NULL",
  ).bind(doc.id).all<{ signature_key: string }>();
  const keys = new Set<string>();
  if (doc.object_key) keys.add(doc.object_key);
  for (const row of versions ?? []) if (row.object_key) keys.add(row.object_key);
  for (const row of signatures ?? []) if (row.signature_key) keys.add(row.signature_key);

  await event(env, doc.id, actor, "DELETED", { fileCount: keys.size });
  await env.DB.prepare("DELETE FROM documents WHERE id=?").bind(doc.id).run();
  await Promise.all([...keys].map((key) => env.FILES.delete(key).catch(() => undefined)));
  return json({ ok: true });
}

async function streamSignature(env: Env, actor: SessionUser, doc: DocumentRow, fieldId: string, manager: boolean): Promise<Response> {
  const version = doc.current_version;
  const row = await env.DB.prepare(
    `SELECT v.signature_key FROM document_field_values v
     JOIN document_fields f ON f.id=v.field_id
     WHERE v.document_id=? AND v.version_number=? AND v.tenant_id=? AND v.field_id=?
       AND f.field_type IN ('SIGNATURE','INITIALS')`,
  ).bind(doc.id, version, doc.tenant_id, fieldId).first<{ signature_key: string | null }>();
  if (!row?.signature_key) return new Response("Not found.", { status: 404 });
  if (!manager && actor.id !== doc.tenant_id) return new Response("Not found.", { status: 404 });
  return streamPrivateInline(env, row.signature_key, "signature.png");
}

function rolePath(actor: SessionUser): string | null {
  if (actor.role === "OWNER") return "owner";
  if (actor.role === "AGENT") return "agent";
  if (actor.role === "TENANT") return "tenant";
  return null;
}

/** Returns null when the request is not a Documentation route. */
export async function handleDocumentationRoute(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const prefix = rolePath(actor);
  if (!prefix || !path.startsWith(`/api/${prefix}/`)) return null;

  if (path === `/api/${prefix}/documentation`) {
    if (method === "GET") return actor.role === "TENANT" ? listTenant(env, actor) : listManager(env, actor);
    if (method === "POST" && actor.role !== "TENANT") return createRequirement(request, env, actor);
    return json({ error: "Not found." }, 404);
  }

  const match = path.match(new RegExp(`^/api/${prefix}/documents/([^/]+)(?:/([^/]+))?(?:/([^/]+))?$`));
  if (!match) return null;
  const [, documentId, action, subId] = match;
  const doc = await getDocument(env, documentId);
  if (!doc) return json({ error: "Document not found." }, 404);

  const manager = actor.role === "OWNER" || actor.role === "AGENT";
  if (manager) {
    if (!(await canManageDocument(env, actor, doc))) return json({ error: "Document not found." }, 404);
  } else if (!(await canTenantAccess(env, actor, doc))) {
    return json({ error: "Document not found." }, 404);
  }

  if (!action && method === "GET") return manager ? managerDetail(env, actor, doc) : tenantDetail(env, actor, doc);
  if (!action && method === "DELETE" && manager) return remove(env, actor, doc);
  if (action === "metadata" && method === "PATCH" && manager) return updateMetadata(request, env, actor, doc);
  if (action === "file" && method === "POST") return replaceFile(request, env, actor, doc, !manager);
  if (action === "fields" && method === "PUT" && manager) return replaceFields(request, env, actor, doc);
  if (action === "progress" && method === "PUT" && !manager) return saveProgress(request, env, actor, doc);
  if (action === "signature" && !subId && method === "POST" && !manager) return saveSignature(request, env, actor, doc);
  if (action === "signature" && subId && method === "GET") return streamSignature(env, actor, doc, subId, manager);
  if (action === "submit" && method === "POST" && !manager) return submitCompletion(env, actor, doc);
  if (action === "reopen" && method === "POST" && manager) return reopen(request, env, actor, doc);
  if (action === "archive" && method === "POST" && manager) return archive(env, actor, doc);
  if (action === "view" && method === "GET") {
    if (!doc.object_key) return new Response("Not found.", { status: 404 });
    return streamPrivateInline(env, doc.object_key, doc.file_name ?? doc.name);
  }
  if (action === "download" && method === "GET") {
    if (!manager && !doc.tenant_download) return json({ error: "Download is disabled for this document." }, 403);
    if (!doc.object_key) return new Response("Not found.", { status: 404 });
    return streamPrivateAttachment(env, doc.object_key, doc.file_name ?? doc.name);
  }
  return json({ error: "Not found." }, 404);
}
