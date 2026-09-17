import type { Env, SessionUser } from "../types";
import {
  listPayments,
  getPayment,
  submitPayment,
  getReceipt,
  getMyDeposit,
  getMyDeductionReceipt,
  getMyAgreement,
  downloadMyAgreement,
  getMyUnit as getMyTenantUnit,
} from "../tenant/routes";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TENANT_PAYMENT_ID = /^\/api\/tenant\/payments\/([^/]+)$/;
const TENANT_PAYMENT_SUBMIT = /^\/api\/tenant\/payments\/([^/]+)\/submit$/;
const TENANT_PAYMENT_RECEIPT = /^\/api\/tenant\/payments\/([^/]+)\/receipt$/;
const TENANT_DEPOSIT_DEDUCTION_RECEIPT = /^\/api\/tenant\/deposit\/deductions\/([^/]+)\/receipt$/;
const TENANT_AGREEMENT_DOWNLOAD = /^\/api\/tenant\/agreement\/([^/]+)\/download$/;
const OWNER_UNIT_LEADER_UNIT = /^\/api\/owner\/unit-leaders\/([^/]+)\/unit$/;

/**
 * Unit Leader is a tenant capability, not a separate tenancy type.
 * These routes let a UNIT_LEADER use the normal tenant rent/deposit/agreement
 * APIs while retaining the dedicated utility APIs under /api/unit-leader/.
 */
export async function handleUnitLeaderTenantRoute(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response | null> {
  if (actor.role !== "UNIT_LEADER") return null;
  const path = new URL(request.url).pathname;
  const method = request.method;

  if (path === "/api/tenant/payments" && method === "GET") return listPayments(env, actor);

  const submit = path.match(TENANT_PAYMENT_SUBMIT);
  if (submit && method === "POST") return submitPayment(request, env, actor, submit[1]);

  const receipt = path.match(TENANT_PAYMENT_RECEIPT);
  if (receipt && method === "GET") return getReceipt(env, actor, receipt[1]);

  const payment = path.match(TENANT_PAYMENT_ID);
  if (payment && method === "GET") return getPayment(env, actor, payment[1]);

  if (path === "/api/tenant/deposit" && method === "GET") return getMyDeposit(env, actor);

  const deductionReceipt = path.match(TENANT_DEPOSIT_DEDUCTION_RECEIPT);
  if (deductionReceipt && method === "GET") return getMyDeductionReceipt(env, actor, deductionReceipt[1]);

  if (path === "/api/tenant/agreement" && method === "GET") return getMyAgreement(env, actor);

  const agreementDownload = path.match(TENANT_AGREEMENT_DOWNLOAD);
  if (agreementDownload && method === "GET") return downloadMyAgreement(env, actor, agreementDownload[1]);

  if (path === "/api/tenant/unit" && method === "GET") return getMyTenantUnit(env, actor);

  return null;
}

interface LeaderRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  unit_id: string;
  unit_label: string;
  property_name: string;
  created_at: string;
}

async function listLeaseBasedUnitLeaders(env: Env, actor: SessionUser): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT tenant.id, tenant.name, tenant.email, tenant.phone, tenant.status,
            l.unit_id, u.label AS unit_label, p.name AS property_name, tenant.created_at
     FROM leases l
     JOIN users tenant ON tenant.id = l.tenant_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE p.owner_id = ? AND l.status = 'ACTIVE' AND l.is_unit_leader = 1
     ORDER BY tenant.name`,
  )
    .bind(actor.id)
    .all<LeaderRow>();

  return json({ unitLeaders: results ?? [] });
}

async function assignLeaseTenantAsUnitLeader(
  request: Request,
  env: Env,
  actor: SessionUser,
  tenantId: string,
): Promise<Response> {
  const body = await request.json().catch(() => null);
  const unitId = typeof body?.unitId === "string" && body.unitId.trim() ? body.unitId.trim() : null;

  const target = await env.DB.prepare(
    `SELECT tenant.id, tenant.name, tenant.role, tenant.status,
            l.id AS lease_id, l.unit_id
     FROM users tenant
     JOIN leases l ON l.tenant_id = tenant.id
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE tenant.id = ? AND l.status = 'ACTIVE' AND p.owner_id = ?
     ORDER BY l.created_at DESC LIMIT 1`,
  )
    .bind(tenantId, actor.id)
    .first<{ id: string; name: string; role: string; status: string; lease_id: string; unit_id: string }>();

  if (!target) return json({ error: "Active tenant not found." }, 404);

  if (!unitId) {
    await env.DB.batch([
      env.DB.prepare("UPDATE leases SET is_unit_leader = 0 WHERE id = ?").bind(target.lease_id),
      env.DB.prepare(
        "UPDATE users SET role = 'TENANT', unit_id = NULL WHERE id = ? AND role = 'UNIT_LEADER'",
      ).bind(target.id),
      env.DB.prepare(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
         VALUES (?, ?, 'UNIT_LEADER_UNASSIGNED', 'user', ?, ?)`,
      ).bind(crypto.randomUUID(), actor.id, target.id, JSON.stringify({ unitId: target.unit_id })),
    ]);
    return json({ ok: true });
  }

  if (unitId !== target.unit_id) {
    return json({ error: "A Unit Leader must be an active tenant of the selected unit." }, 409);
  }

  const ownedUnit = await env.DB.prepare(
    `SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id
     WHERE u.id = ? AND p.owner_id = ? AND u.archived_at IS NULL AND p.archived_at IS NULL`,
  )
    .bind(unitId, actor.id)
    .first();
  if (!ownedUnit) return json({ error: "Active unit not found." }, 404);

  const currentLeaseLeader = await env.DB.prepare(
    `SELECT tenant.id, tenant.name
     FROM leases l JOIN users tenant ON tenant.id = l.tenant_id
     WHERE l.unit_id = ? AND l.status = 'ACTIVE' AND l.is_unit_leader = 1 AND tenant.id != ?
     LIMIT 1`,
  )
    .bind(unitId, target.id)
    .first<{ id: string; name: string }>();

  const statements: D1PreparedStatement[] = [];

  if (currentLeaseLeader) {
    statements.push(
      env.DB.prepare("UPDATE leases SET is_unit_leader = 0 WHERE unit_id = ? AND status = 'ACTIVE'").bind(unitId),
      env.DB.prepare(
        "UPDATE users SET role = 'TENANT', unit_id = NULL WHERE id = ? AND role = 'UNIT_LEADER'",
      ).bind(currentLeaseLeader.id),
    );
  }

  // Also release a legacy standalone Unit Leader attached to the unit. This
  // keeps older production data compatible while moving the product to the
  // tenant-based role model.
  statements.push(
    env.DB.prepare(
      "UPDATE users SET role = 'TENANT', unit_id = NULL WHERE role = 'UNIT_LEADER' AND unit_id = ? AND id != ?",
    ).bind(unitId, target.id),
    env.DB.prepare("UPDATE leases SET is_unit_leader = 1 WHERE id = ?").bind(target.lease_id),
    env.DB.prepare(
      "UPDATE users SET role = 'UNIT_LEADER', unit_id = ? WHERE id = ? AND role IN ('TENANT', 'UNIT_LEADER')",
    ).bind(unitId, target.id),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'UNIT_LEADER_ASSIGNED', 'user', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      actor.id,
      target.id,
      JSON.stringify({ unitId, leaseId: target.lease_id, replacedLeaderId: currentLeaseLeader?.id ?? null }),
    ),
  );

  await env.DB.batch(statements);
  return json({ ok: true, unitLeader: { id: target.id, name: target.name, unitId } });
}

/**
 * Owner-facing Unit Leader management. New Unit Leaders must be selected from
 * an existing active tenancy so rent, deposits and documents stay on the same
 * account. POST creation is intentionally rejected to prevent utility-only
 * accounts from being created again.
 */
export async function handleOwnerUnitLeaderRoleRoute(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response | null> {
  if (actor.role !== "OWNER") return null;
  const path = new URL(request.url).pathname;
  const method = request.method;

  if (path === "/api/owner/unit-leaders" && method === "GET") {
    return listLeaseBasedUnitLeaders(env, actor);
  }

  if (path === "/api/owner/unit-leaders" && method === "POST") {
    return json(
      { error: "Create the person as a tenant first, then assign that tenant as Unit Leader." },
      409,
    );
  }

  const match = path.match(OWNER_UNIT_LEADER_UNIT);
  if (match && method === "PATCH") {
    return assignLeaseTenantAsUnitLeader(request, env, actor, match[1]);
  }

  return null;
}
