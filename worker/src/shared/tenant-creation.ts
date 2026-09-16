import type { Env, SessionUser, PropertyRow, UnitRow } from "../types";
import { getUserByEmail } from "../db";
import { generateToken, hashToken } from "../auth/session";
import { INVITE_TTL_MS } from "../auth/routes";
import { putValidatedFile } from "./file-security";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function monthFromDate(dateStr: string): string { return dateStr.slice(0, 7); }

export type ScopeCheckResult = { property: PropertyRow; unit: UnitRow } | { error: string; status: number };
export type ScopeCheck = (env: Env, propertyId: string, unitId: string) => Promise<ScopeCheckResult>;

export async function createTenantForActor(
  request: Request,
  env: Env,
  actor: SessionUser,
  verifyScope: ScopeCheck,
  auditAction: string,
): Promise<Response> {
  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Invalid form data." }, 400);
  const str = (key: string) => { const value = form.get(key); return typeof value === "string" ? value.trim() : ""; };
  const name = str("name");
  const email = str("email").toLowerCase();
  const phone = str("phone") || null;
  const propertyId = str("propertyId");
  const unitId = str("unitId");
  const leaseStartDate = str("leaseStartDate");
  const monthlyRentDollars = Number(str("monthlyRent"));
  const dueDay = Number(str("dueDay"));
  const depositDollars = Number(str("deposit") || "0");
  const firstMonthRentPaid = str("firstMonthRentPaid") === "true";
  const agreementFile = form.get("agreement");

  if (!name || !email || !propertyId || !unitId || !leaseStartDate) return json({ error: "Name, email, property, unit, and lease start date are required." }, 400);
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (!Number.isFinite(monthlyRentDollars) || monthlyRentDollars <= 0) return json({ error: "Monthly rent must be a positive number." }, 400);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return json({ error: "Due day must be a number between 1 and 31." }, 400);
  if (!Number.isFinite(depositDollars) || depositDollars < 0) return json({ error: "Deposit must be zero or a positive number." }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(leaseStartDate)) return json({ error: "Lease start date must be in YYYY-MM-DD format." }, 400);

  const scope = await verifyScope(env, propertyId, unitId);
  if ("error" in scope) return json({ error: scope.error }, scope.status);
  if (scope.property.archived_at || scope.unit.archived_at) return json({ error: "Archived properties or units cannot accept a new tenant." }, 409);
  const verifiedUnitId = scope.unit.id;
  if (await env.DB.prepare("SELECT id FROM leases WHERE unit_id=? AND status='ACTIVE'").bind(verifiedUnitId).first()) return json({ error: "This unit already has an active tenant." }, 409);
  if (await getUserByEmail(env, email)) return json({ error: "An account with this email already exists." }, 409);

  const tenantId = crypto.randomUUID();
  const leaseId = crypto.randomUUID();
  const rentPaymentId = crypto.randomUUID();
  const inviteToken = generateToken();
  const inviteTokenHash = await hashToken(inviteToken);
  const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const monthlyRentCents = Math.round(monthlyRentDollars * 100);
  const depositCents = Math.round(depositDollars * 100);
  const month = monthFromDate(leaseStartDate);
  const rentStatus = firstMonthRentPaid ? "PAYMENT_CONFIRMED" : "WAITING_PAYMENT";
  const now = new Date().toISOString();

  let agreementId: string | null = null;
  let agreementFileKey: string | null = null;
  let agreementStatements: D1PreparedStatement[] = [];
  if (agreementFile instanceof File && agreementFile.size > 0) {
    const stored = await putValidatedFile(env, `documentation/${tenantId}`, agreementFile);
    if (!stored.ok) return json({ error: stored.error }, stored.status);
    agreementId = crypto.randomUUID();
    agreementFileKey = stored.fileKey;
    const versionId = crypto.randomUUID();
    // Keep the legacy row during the transition so an older cached frontend
    // does not break. The new Documentation row is authoritative.
    agreementStatements = [
      env.DB.prepare(
        `INSERT INTO agreements (id,tenant_id,lease_id,file_key,file_name,uploaded_by,uploaded_at)
         VALUES (?,?,?,?,?,?,?)`,
      ).bind(agreementId, tenantId, leaseId, stored.fileKey, agreementFile.name, actor.id, now),
      env.DB.prepare(
        `INSERT INTO documents (
          id,tenant_id,lease_id,property_id,unit_id,name,category,description,file_name,file_type,file_size,
          object_key,uploaded_by,uploaded_at,updated_at,status,tenant_visible,tenant_download,tenant_upload,
          required,current_version,created_at
        ) VALUES (?,?,?,?,?,'Rental Agreement','Rental','Rental agreement',?,?,?,?,?,?,?,'UPLOADED',1,1,0,0,1,?)`,
      ).bind(
        agreementId, tenantId, leaseId, propertyId, verifiedUnitId,
        agreementFile.name, stored.upload.contentType, agreementFile.size, stored.fileKey,
        actor.id, now, now, now,
      ),
      env.DB.prepare(
        `INSERT INTO document_versions
         (id,document_id,version_number,file_name,file_type,file_size,object_key,uploaded_by,source,uploaded_at)
         VALUES (?,?,1,?,?,?,?,?,'OWNER',?)`,
      ).bind(versionId, agreementId, agreementFile.name, stored.upload.contentType, agreementFile.size, stored.fileKey, actor.id, now),
    ];
  }

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id,email,name,phone,role,password_hash,status,created_by)
         VALUES (?,?,?,?,'TENANT',NULL,'WAITING_FOR_ACTIVATION',?)`,
      ).bind(tenantId, email, name, phone, actor.id),
      env.DB.prepare(
        `INSERT INTO leases (id,unit_id,tenant_id,monthly_rent,start_date,due_day,deposit,status)
         VALUES (?,?,?,?,?,?,?,'ACTIVE')`,
      ).bind(leaseId, verifiedUnitId, tenantId, monthlyRentCents, leaseStartDate, dueDay, depositCents),
      env.DB.prepare(
        `INSERT INTO rent_payments (id,lease_id,month,amount,due_date,status,submitted_at,payment_date,reviewed_by)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).bind(rentPaymentId, leaseId, month, monthlyRentCents, leaseStartDate, rentStatus, firstMonthRentPaid ? now : null, firstMonthRentPaid ? now : null, firstMonthRentPaid ? actor.id : null),
      env.DB.prepare("INSERT INTO invitations (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(inviteTokenHash, tenantId, inviteExpiresAt),
      env.DB.prepare(
        `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,metadata)
         VALUES (?, ?, ?, 'user', ?, ?)`,
      ).bind(crypto.randomUUID(), actor.id, auditAction, tenantId, JSON.stringify({ propertyId, unitId: verifiedUnitId, leaseId, firstMonthRentPaid })),
      ...agreementStatements,
    ]);
  } catch (error) {
    if (agreementFileKey) await env.FILES.delete(agreementFileKey).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE constraint failed: leases.unit_id")) return json({ error: "This unit already has an active tenant." }, 409);
    if (message.includes("UNIQUE constraint failed: users.email")) return json({ error: "An account with this email already exists." }, 409);
    throw error;
  }

  return json({
    tenant: { id: tenantId, name, email, phone },
    leaseId,
    inviteLink: `${env.FRONTEND_URL.replace(/\/+$/, "")}/invite/${inviteToken}`,
    agreementId,
  }, 201);
}
