import type { Env, SessionUser } from "../types";
import { getUserByEmail, getPropertyById, getUnitById, listOwnerPropertiesWithUnits } from "../db";
import { generateToken, hashToken } from "../auth/session";
import { INVITE_TTL_MS } from "../auth/routes";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** GET /api/owner/properties — this Owner's properties + units, for the tenant-creation picker. */
export async function listProperties(env: Env, actor: SessionUser): Promise<Response> {
  const properties = await listOwnerPropertiesWithUnits(env, actor.id);
  return json({ properties });
}

function monthFromDate(dateStr: string): string {
  // dateStr is 'YYYY-MM-DD' — first 7 characters are 'YYYY-MM'.
  return dateStr.slice(0, 7);
}

/**
 * POST /api/owner/tenants (multipart/form-data)
 * Fields: name, email, phone?, propertyId, unitId, monthlyRent, leaseStartDate,
 * dueDay, deposit, firstMonthRentPaid ("true"|"false"), agreement (file, optional).
 */
export async function createTenant(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Invalid form data." }, 400);

  const str = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" ? v.trim() : "";
  };

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

  if (!name || !email || !propertyId || !unitId || !leaseStartDate) {
    return json({ error: "Name, email, property, unit, and lease start date are required." }, 400);
  }
  if (!Number.isFinite(monthlyRentDollars) || monthlyRentDollars <= 0) {
    return json({ error: "Monthly rent must be a positive number." }, 400);
  }
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    return json({ error: "Due day must be a number between 1 and 31." }, 400);
  }
  if (!Number.isFinite(depositDollars) || depositDollars < 0) {
    return json({ error: "Deposit must be zero or a positive number." }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(leaseStartDate)) {
    return json({ error: "Lease start date must be in YYYY-MM-DD format." }, 400);
  }

  // Ownership checks — Owner can only create tenants under their own property/unit.
  const property = await getPropertyById(env, propertyId);
  if (!property || property.owner_id !== actor.id) {
    return json({ error: "Property not found." }, 404);
  }
  const unit = await getUnitById(env, unitId);
  if (!unit || unit.property_id !== property.id) {
    return json({ error: "Unit not found on this property." }, 404);
  }

  const existing = await getUserByEmail(env, email);
  if (existing) {
    return json({ error: "An account with this email already exists." }, 409);
  }

  const tenantId = crypto.randomUUID();
  const leaseId = crypto.randomUUID();
  const rentPaymentId = crypto.randomUUID();
  const inviteToken = generateToken();
  const inviteTokenHash = await hashToken(inviteToken);
  const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const auditLogId = crypto.randomUUID();

  const monthlyRentCents = Math.round(monthlyRentDollars * 100);
  const depositCents = Math.round(depositDollars * 100);
  const month = monthFromDate(leaseStartDate);
  const rentStatus = firstMonthRentPaid ? "PAYMENT_CONFIRMED" : "WAITING_PAYMENT";
  const now = new Date().toISOString();

  // Agreement upload (R2) happens outside the D1 batch — object storage isn't
  // part of the database transaction, so we upload first and only reference
  // the resulting key in the batch below.
  let agreementId: string | null = null;
  let agreementStatements: D1PreparedStatement[] = [];

  if (agreementFile instanceof File && agreementFile.size > 0) {
    agreementId = crypto.randomUUID();
    const fileKey = `agreements/${tenantId}/${Date.now()}-${agreementFile.name}`;
    await env.FILES.put(fileKey, await agreementFile.arrayBuffer(), {
      httpMetadata: { contentType: agreementFile.type || "application/octet-stream" },
    });
    agreementStatements = [
      env.DB.prepare(
        `INSERT INTO agreements (id, tenant_id, lease_id, file_key, file_name, uploaded_by, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(agreementId, tenantId, leaseId, fileKey, agreementFile.name, actor.id, now),
    ];
  }

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, email, name, phone, role, password_hash, status)
       VALUES (?, ?, ?, ?, 'TENANT', NULL, 'WAITING_FOR_ACTIVATION')`,
    ).bind(tenantId, email, name, phone),

    env.DB.prepare(
      `INSERT INTO leases (id, unit_id, tenant_id, monthly_rent, start_date, due_day, deposit, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
    ).bind(leaseId, unitId, tenantId, monthlyRentCents, leaseStartDate, dueDay, depositCents),

    env.DB.prepare(
      `INSERT INTO rent_payments (id, lease_id, month, amount, due_date, status, submitted_at, payment_date, reviewed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      rentPaymentId,
      leaseId,
      month,
      monthlyRentCents,
      leaseStartDate,
      rentStatus,
      firstMonthRentPaid ? now : null,
      firstMonthRentPaid ? now : null,
      firstMonthRentPaid ? actor.id : null,
    ),

    env.DB.prepare(
      "INSERT INTO invitations (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    ).bind(inviteTokenHash, tenantId, inviteExpiresAt),

    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'TENANT_CREATED', 'user', ?, ?)`,
    ).bind(
      auditLogId,
      actor.id,
      tenantId,
      JSON.stringify({ propertyId, unitId, leaseId, firstMonthRentPaid }),
    ),

    ...agreementStatements,
  ]);

  return json(
    {
      tenant: { id: tenantId, name, email, phone },
      leaseId,
      inviteLink: `${env.FRONTEND_URL}/invite/${inviteToken}`,
      agreementId,
    },
    201,
  );
}
