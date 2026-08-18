import type { Env, SessionUser } from "../types";
import { getPropertyById, getUnitById, listOwnerPropertiesWithUnits } from "../db";
import { generateToken, hashToken } from "../auth/session";
import { INVITE_TTL_MS } from "../auth/routes";
import { createTenantForActor } from "../shared/tenant-creation";
import type { ScopeCheck } from "../shared/tenant-creation";
import { confirmPaymentCore, rejectPaymentCore, streamReceipt } from "../shared/payment-review";
import { confirmUtilityCore, rejectUtilityCore, streamUtilityReceipt } from "../shared/utility-review";
import { createDepositRoutes } from "../shared/deposits";

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

/**
 * POST /api/owner/tenants (multipart/form-data)
 * Fields: name, email, phone?, propertyId, unitId, monthlyRent, leaseStartDate,
 * dueDay, deposit, firstMonthRentPaid ("true"|"false"), agreement (file, optional).
 */
export async function createTenant(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const verifyScope: ScopeCheck = async (env, propertyId, unitId) => {
    const property = await getPropertyById(env, propertyId);
    if (!property || property.owner_id !== actor.id) {
      return { error: "Property not found.", status: 404 };
    }
    const unit = await getUnitById(env, unitId);
    if (!unit || unit.property_id !== property.id) {
      return { error: "Unit not found on this property.", status: 404 };
    }
    return { property, unit };
  };

  return createTenantForActor(request, env, actor, verifyScope, "TENANT_CREATED");
}

export interface AgentRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "WAITING_FOR_ACTIVATION" | "INACTIVE";
  created_at: string;
}

export interface AgentAssignmentRow {
  id: string;
  agent_id: string;
  property_id: string;
  unit_id: string | null;
  property_name: string;
  unit_label: string | null;
}

/** GET /api/owner/agents — agents this Owner created, with their current assignments. */
export async function listAgents(env: Env, actor: SessionUser): Promise<Response> {
  const { results: agents } = await env.DB.prepare(
    `SELECT id, name, email, phone, status, created_at FROM users
     WHERE role = 'AGENT' AND created_by = ? ORDER BY name`,
  )
    .bind(actor.id)
    .all<AgentRow>();

  const { results: assignments } = await env.DB.prepare(
    `SELECT agent_assignments.*, properties.name AS property_name, units.label AS unit_label
     FROM agent_assignments
     JOIN properties ON properties.id = agent_assignments.property_id
     LEFT JOIN units ON units.id = agent_assignments.unit_id
     WHERE properties.owner_id = ?`,
  )
    .bind(actor.id)
    .all<AgentAssignmentRow>();

  const withAssignments = (agents ?? []).map((agent) => ({
    ...agent,
    assignments: (assignments ?? []).filter((a) => a.agent_id === agent.id),
  }));

  return json({ agents: withAssignments });
}

/** POST /api/owner/agents (JSON: name, email, phone?) — creates and invites an Agent. */
export async function createAgent(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body?.phone === "string" && body.phone.trim() ? body.phone.trim() : null;

  if (!name || !email) {
    return json({ error: "Name and email are required." }, 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) {
    return json({ error: "An account with this email already exists." }, 409);
  }

  const agentId = crypto.randomUUID();
  const inviteToken = generateToken();
  const inviteTokenHash = await hashToken(inviteToken);
  const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, email, name, phone, role, password_hash, status, created_by)
       VALUES (?, ?, ?, ?, 'AGENT', NULL, 'WAITING_FOR_ACTIVATION', ?)`,
    ).bind(agentId, email, name, phone, actor.id),
    env.DB.prepare(
      "INSERT INTO invitations (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    ).bind(inviteTokenHash, agentId, inviteExpiresAt),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'AGENT_CREATED', 'user', ?, ?)`,
    ).bind(auditLogId, actor.id, agentId, JSON.stringify({ email })),
  ]);

  return json(
    { agent: { id: agentId, name, email, phone }, inviteLink: `${env.FRONTEND_URL}/invite/${inviteToken}` },
    201,
  );
}

async function getOwnedAgent(env: Env, actor: SessionUser, agentId: string) {
  const row = await env.DB.prepare(
    "SELECT * FROM users WHERE id = ? AND role = 'AGENT' AND created_by = ?",
  )
    .bind(agentId, actor.id)
    .first<{ id: string; status: string }>();
  return row ?? null;
}

/** POST /api/owner/agents/:id/deactivate — ACTIVE -> INACTIVE. */
export async function deactivateAgent(env: Env, actor: SessionUser, agentId: string): Promise<Response> {
  const agent = await getOwnedAgent(env, actor, agentId);
  if (!agent) return json({ error: "Agent not found." }, 404);
  if (agent.status !== "ACTIVE") {
    return json({ error: "Only an active agent can be deactivated." }, 409);
  }

  const auditLogId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET status = 'INACTIVE' WHERE id = ?").bind(agentId),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id) VALUES (?, ?, 'AGENT_DEACTIVATED', 'user', ?)`,
    ).bind(auditLogId, actor.id, agentId),
  ]);

  return json({ ok: true });
}

/** POST /api/owner/agents/:id/activate — INACTIVE -> ACTIVE. */
export async function activateAgent(env: Env, actor: SessionUser, agentId: string): Promise<Response> {
  const agent = await getOwnedAgent(env, actor, agentId);
  if (!agent) return json({ error: "Agent not found." }, 404);
  if (agent.status !== "INACTIVE") {
    return json({ error: "Only a deactivated agent can be reactivated." }, 409);
  }

  const auditLogId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET status = 'ACTIVE' WHERE id = ?").bind(agentId),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id) VALUES (?, ?, 'AGENT_ACTIVATED', 'user', ?)`,
    ).bind(auditLogId, actor.id, agentId),
  ]);

  return json({ ok: true });
}

/** POST /api/owner/agents/:id/assignments (JSON: propertyId, unitId?) */
export async function createAssignment(request: Request, env: Env, actor: SessionUser, agentId: string): Promise<Response> {
  const agent = await getOwnedAgent(env, actor, agentId);
  if (!agent) return json({ error: "Agent not found." }, 404);

  const body = await request.json().catch(() => null);
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId : "";
  const unitId = typeof body?.unitId === "string" && body.unitId ? body.unitId : null;

  if (!propertyId) return json({ error: "propertyId is required." }, 400);

  const property = await getPropertyById(env, propertyId);
  if (!property || property.owner_id !== actor.id) {
    return json({ error: "Property not found." }, 404);
  }
  if (unitId) {
    const unit = await getUnitById(env, unitId);
    if (!unit || unit.property_id !== property.id) {
      return json({ error: "Unit not found on this property." }, 404);
    }
  }

  const assignmentId = crypto.randomUUID();
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO agent_assignments (id, agent_id, property_id, unit_id) VALUES (?, ?, ?, ?)",
    ).bind(assignmentId, agentId, propertyId, unitId),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'AGENT_ASSIGNED', 'agent_assignment', ?, ?)`,
    ).bind(auditLogId, actor.id, assignmentId, JSON.stringify({ agentId, propertyId, unitId })),
  ]);

  return json({ assignment: { id: assignmentId, agentId, propertyId, unitId } }, 201);
}

/** DELETE /api/owner/agents/:agentId/assignments/:assignmentId */
export async function removeAssignment(
  env: Env,
  actor: SessionUser,
  agentId: string,
  assignmentId: string,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT agent_assignments.id FROM agent_assignments
     JOIN properties ON properties.id = agent_assignments.property_id
     WHERE agent_assignments.id = ? AND agent_assignments.agent_id = ? AND properties.owner_id = ?`,
  )
    .bind(assignmentId, agentId, actor.id)
    .first();

  if (!row) return json({ error: "Assignment not found." }, 404);

  const auditLogId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM agent_assignments WHERE id = ?").bind(assignmentId),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'AGENT_UNASSIGNED', 'agent_assignment', ?, ?)`,
    ).bind(auditLogId, actor.id, assignmentId, JSON.stringify({ agentId })),
  ]);

  return json({ ok: true });
}

export interface OwnerPaymentReviewRow {
  id: string;
  lease_id: string;
  month: string;
  amount: number;
  due_date: string;
  status: "WAITING_PAYMENT" | "PENDING_REVIEW" | "PAYMENT_CONFIRMED";
  receipt_key: string | null;
  submitted_at: string | null;
  payment_date: string | null;
  tenant_id: string;
  tenant_name: string;
  property_name: string;
  unit_label: string;
}

const SELECT_OWNER_PAYMENT = `
  SELECT
    rent_payments.*,
    leases.tenant_id AS tenant_id,
    tenant.name AS tenant_name,
    properties.name AS property_name,
    units.label AS unit_label
  FROM rent_payments
  JOIN leases ON leases.id = rent_payments.lease_id
  JOIN units ON units.id = leases.unit_id
  JOIN properties ON properties.id = units.property_id
  JOIN users AS tenant ON tenant.id = leases.tenant_id
  WHERE properties.owner_id = ?
`;

/** GET /api/owner/payments/pending — rent payments awaiting this Owner's review, oldest first. */
export async function listPendingPayments(env: Env, actor: SessionUser): Promise<Response> {
  const { results } = await env.DB.prepare(
    `${SELECT_OWNER_PAYMENT} AND rent_payments.status = 'PENDING_REVIEW' ORDER BY rent_payments.submitted_at ASC`,
  )
    .bind(actor.id)
    .all<OwnerPaymentReviewRow>();

  return json({ payments: results ?? [] });
}

async function getOwnedReviewPayment(
  env: Env,
  actor: SessionUser,
  paymentId: string,
): Promise<OwnerPaymentReviewRow | null> {
  const row = await env.DB.prepare(`${SELECT_OWNER_PAYMENT} AND rent_payments.id = ?`)
    .bind(actor.id, paymentId)
    .first<OwnerPaymentReviewRow>();
  return row ?? null;
}

/** GET /api/owner/payments/:id — single payment, for the review detail screen. */
export async function getPaymentForReview(env: Env, actor: SessionUser, paymentId: string): Promise<Response> {
  const payment = await getOwnedReviewPayment(env, actor, paymentId);
  if (!payment) return json({ error: "Payment not found." }, 404);
  return json({ payment });
}

/** GET /api/owner/payments/:id/receipt — streams the tenant's uploaded receipt, Owner-scoped. */
export async function getPaymentReceipt(env: Env, actor: SessionUser, paymentId: string): Promise<Response> {
  const payment = await getOwnedReviewPayment(env, actor, paymentId);
  if (!payment) return new Response("Not found.", { status: 404 });
  return streamReceipt(env, payment);
}

/** POST /api/owner/payments/:id/confirm — PENDING_REVIEW -> PAYMENT_CONFIRMED. */
export async function confirmPayment(env: Env, actor: SessionUser, paymentId: string): Promise<Response> {
  return confirmPaymentCore(env, actor, paymentId, "OWNER", getOwnedReviewPayment);
}

/** POST /api/owner/payments/:id/reject — PENDING_REVIEW -> WAITING_PAYMENT. Body: { reason?: string } optional. */
export async function rejectPayment(request: Request, env: Env, actor: SessionUser, paymentId: string): Promise<Response> {
  return rejectPaymentCore(request, env, actor, paymentId, "OWNER", getOwnedReviewPayment);
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: string | null;
  created_at: string;
  actor_name: string;
  actor_role: string;
}

/** GET /api/owner/payments/:id/audit — this payment's review history, Owner-scoped. */
export async function getPaymentAuditLog(env: Env, actor: SessionUser, paymentId: string): Promise<Response> {
  const payment = await getOwnedReviewPayment(env, actor, paymentId);
  if (!payment) return json({ error: "Payment not found." }, 404);

  const { results } = await env.DB.prepare(
    `SELECT audit_logs.id, audit_logs.action, audit_logs.entity_type, audit_logs.entity_id,
            audit_logs.metadata, audit_logs.created_at,
            actor.name AS actor_name, actor.role AS actor_role
     FROM audit_logs
     JOIN users AS actor ON actor.id = audit_logs.user_id
     WHERE audit_logs.entity_type = 'rent_payment' AND audit_logs.entity_id = ?
     ORDER BY audit_logs.created_at DESC`,
  )
    .bind(paymentId)
    .all<AuditLogEntry>();

  return json({ entries: results ?? [] });
}

export interface OwnerUtilityReviewRow {
  id: string;
  unit_id: string;
  type: "WATER" | "ELECTRICITY";
  month: string;
  amount: number;
  status: "WAITING_PAYMENT" | "PENDING_REVIEW" | "PAYMENT_CONFIRMED";
  receipt_key: string | null;
  submitted_at: string | null;
  payment_date: string | null;
  property_name: string;
  unit_label: string;
  leader_name: string | null;
}

const SELECT_OWNER_UTILITY = `
  SELECT
    utility_payments.*,
    properties.name AS property_name,
    units.label AS unit_label,
    leader.name AS leader_name
  FROM utility_payments
  JOIN units ON units.id = utility_payments.unit_id
  JOIN properties ON properties.id = units.property_id
  LEFT JOIN users AS leader ON leader.unit_id = units.id AND leader.role = 'UNIT_LEADER'
  WHERE properties.owner_id = ?
`;

/** GET /api/owner/utilities/pending — water/electricity payments awaiting this Owner's review. */
export async function listPendingUtilities(env: Env, actor: SessionUser): Promise<Response> {
  const { results } = await env.DB.prepare(
    `${SELECT_OWNER_UTILITY} AND utility_payments.status = 'PENDING_REVIEW' ORDER BY utility_payments.submitted_at ASC`,
  )
    .bind(actor.id)
    .all<OwnerUtilityReviewRow>();

  return json({ utilities: results ?? [] });
}

async function getOwnedUtility(env: Env, actor: SessionUser, utilityId: string): Promise<OwnerUtilityReviewRow | null> {
  const row = await env.DB.prepare(`${SELECT_OWNER_UTILITY} AND utility_payments.id = ?`)
    .bind(actor.id, utilityId)
    .first<OwnerUtilityReviewRow>();
  return row ?? null;
}

/** GET /api/owner/utilities/:id */
export async function getUtilityForReview(env: Env, actor: SessionUser, utilityId: string): Promise<Response> {
  const utility = await getOwnedUtility(env, actor, utilityId);
  if (!utility) return json({ error: "Utility payment not found." }, 404);
  return json({ utility });
}

/** GET /api/owner/utilities/:id/receipt */
export async function getUtilityReceipt(env: Env, actor: SessionUser, utilityId: string): Promise<Response> {
  const utility = await getOwnedUtility(env, actor, utilityId);
  if (!utility) return new Response("Not found.", { status: 404 });
  return streamUtilityReceipt(env, utility);
}

/** POST /api/owner/utilities/:id/confirm */
export async function confirmUtility(env: Env, actor: SessionUser, utilityId: string): Promise<Response> {
  return confirmUtilityCore(env, actor, utilityId, "OWNER", getOwnedUtility);
}

/** POST /api/owner/utilities/:id/reject */
export async function rejectUtility(request: Request, env: Env, actor: SessionUser, utilityId: string): Promise<Response> {
  return rejectUtilityCore(request, env, actor, utilityId, "OWNER", getOwnedUtility);
}

/** GET /api/owner/tenants — this Owner's tenants, with their lease id (for deposit management). */
export async function listTenants(env: Env, actor: SessionUser): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT tenant.id, tenant.name, tenant.email, tenant.phone, tenant.status,
            leases.id AS lease_id, leases.is_unit_leader,
            properties.name AS property_name, units.label AS unit_label
     FROM leases
     JOIN units ON units.id = leases.unit_id
     JOIN properties ON properties.id = units.property_id
     JOIN users AS tenant ON tenant.id = leases.tenant_id
     WHERE properties.owner_id = ? AND leases.status = 'ACTIVE'
     ORDER BY tenant.name`,
  )
    .bind(actor.id)
    .all();

  return json({ tenants: results ?? [] });
}

const depositRoutes = createDepositRoutes(async (env, actor, leaseId) => {
  const row = await env.DB.prepare(
    `SELECT leases.id FROM leases
     JOIN units ON units.id = leases.unit_id
     JOIN properties ON properties.id = units.property_id
     WHERE leases.id = ? AND properties.owner_id = ?`,
  )
    .bind(leaseId, actor.id)
    .first();
  return Boolean(row);
});

export const getDeposit = depositRoutes.getDeposit;
export const createDepositItemRoute = depositRoutes.createItem;
export const updateDepositItemRoute = depositRoutes.updateItem;
export const deleteDepositItemRoute = depositRoutes.deleteItem;
export const finalizeDepositRoute = depositRoutes.finalize;
export const recordDepositPaymentRoute = depositRoutes.recordPayment;
export const createDepositDeductionRoute = depositRoutes.createDeductionRoute;
export const deleteDepositDeductionRoute = depositRoutes.deleteDeductionRoute;
export const recordDepositReturnRoute = depositRoutes.recordReturnRoute;
export const getDepositDeductionReceiptRoute = depositRoutes.getDeductionReceipt;
export const getDepositPaymentReceiptRoute = depositRoutes.getPaymentReceipt;
