import type { Env, SessionUser } from "../types";
import { getPropertyById, getUnitById } from "../db";
import { createTenantForActor } from "../shared/tenant-creation";
import type { ScopeCheck } from "../shared/tenant-creation";
import { confirmPaymentCore, rejectPaymentCore, streamReceipt } from "../shared/payment-review";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface AssignmentRow {
  property_id: string;
  unit_id: string | null;
}

/** All unit ids this agent can act on — expands property-wide assignments to every unit in that property. */
async function getAssignedUnitIds(env: Env, agentId: string): Promise<Set<string>> {
  const { results: assignments } = await env.DB.prepare(
    "SELECT property_id, unit_id FROM agent_assignments WHERE agent_id = ?",
  )
    .bind(agentId)
    .all<AssignmentRow>();

  const unitIds = new Set<string>();
  const propertyWideIds: string[] = [];

  for (const a of assignments ?? []) {
    if (a.unit_id) {
      unitIds.add(a.unit_id);
    } else {
      propertyWideIds.push(a.property_id);
    }
  }

  if (propertyWideIds.length > 0) {
    const placeholders = propertyWideIds.map(() => "?").join(",");
    const { results: units } = await env.DB.prepare(
      `SELECT id FROM units WHERE property_id IN (${placeholders})`,
    )
      .bind(...propertyWideIds)
      .all<{ id: string }>();
    for (const u of units ?? []) unitIds.add(u.id);
  }

  return unitIds;
}

/** GET /api/agent/properties — properties/units this Agent is assigned to. */
export async function listAssignedProperties(env: Env, actor: SessionUser): Promise<Response> {
  const { results: assignments } = await env.DB.prepare(
    `SELECT DISTINCT properties.id, properties.name, properties.address
     FROM agent_assignments
     JOIN properties ON properties.id = agent_assignments.property_id
     WHERE agent_assignments.agent_id = ?
     ORDER BY properties.name`,
  )
    .bind(actor.id)
    .all<{ id: string; name: string; address: string }>();

  const unitIds = await getAssignedUnitIds(env, actor.id);
  const properties = [];

  for (const property of assignments ?? []) {
    const { results: allUnits } = await env.DB.prepare(
      "SELECT id, label, monthly_rent FROM units WHERE property_id = ? ORDER BY label",
    )
      .bind(property.id)
      .all<{ id: string; label: string; monthly_rent: number }>();

    properties.push({
      ...property,
      units: (allUnits ?? []).filter((u) => unitIds.has(u.id)),
    });
  }

  return json({ properties });
}

/** GET /api/agent/tenants — tenants whose lease is on a unit this Agent is assigned to. */
export async function listAssignedTenants(env: Env, actor: SessionUser): Promise<Response> {
  const unitIds = await getAssignedUnitIds(env, actor.id);
  if (unitIds.size === 0) return json({ tenants: [] });

  const placeholders = [...unitIds].map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT tenant.id, tenant.name, tenant.email, tenant.phone, tenant.status,
            properties.name AS property_name, units.label AS unit_label
     FROM leases
     JOIN units ON units.id = leases.unit_id
     JOIN properties ON properties.id = units.property_id
     JOIN users AS tenant ON tenant.id = leases.tenant_id
     WHERE leases.unit_id IN (${placeholders}) AND leases.status = 'ACTIVE'
     ORDER BY tenant.name`,
  )
    .bind(...unitIds)
    .all();

  return json({ tenants: results ?? [] });
}

/**
 * POST /api/agent/tenants (multipart/form-data) — same fields as the Owner
 * version, but scoped to units this Agent has been assigned to.
 */
export async function createTenant(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const verifyScope: ScopeCheck = async (env, propertyId, unitId) => {
    const property = await getPropertyById(env, propertyId);
    if (!property) return { error: "Property not found.", status: 404 };

    const unit = await getUnitById(env, unitId);
    if (!unit || unit.property_id !== property.id) {
      return { error: "Unit not found on this property.", status: 404 };
    }

    const assignedUnitIds = await getAssignedUnitIds(env, actor.id);
    if (!assignedUnitIds.has(unit.id)) {
      return { error: "You aren't assigned to this unit.", status: 403 };
    }

    return { property, unit };
  };

  return createTenantForActor(request, env, actor, verifyScope, "TENANT_CREATED_BY_AGENT");
}

export interface AgentPaymentReviewRow {
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

/**
 * Rent payments on units this Agent is assigned to. Deliberately selects
 * only the columns needed for review — no property-wide financial totals,
 * so there's nothing here for an Agent to aggregate into "global revenue".
 */
async function selectAgentPayments(
  env: Env,
  actor: SessionUser,
  extraWhere: string,
  extraParams: unknown[] = [],
): Promise<AgentPaymentReviewRow[]> {
  const unitIds = await getAssignedUnitIds(env, actor.id);
  if (unitIds.size === 0) return [];

  const placeholders = [...unitIds].map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT
       rent_payments.id, rent_payments.lease_id, rent_payments.month, rent_payments.amount,
       rent_payments.due_date, rent_payments.status, rent_payments.receipt_key,
       rent_payments.submitted_at, rent_payments.payment_date,
       leases.tenant_id AS tenant_id,
       tenant.name AS tenant_name,
       properties.name AS property_name,
       units.label AS unit_label
     FROM rent_payments
     JOIN leases ON leases.id = rent_payments.lease_id
     JOIN units ON units.id = leases.unit_id
     JOIN properties ON properties.id = units.property_id
     JOIN users AS tenant ON tenant.id = leases.tenant_id
     WHERE leases.unit_id IN (${placeholders}) ${extraWhere}`,
  )
    .bind(...unitIds, ...extraParams)
    .all<AgentPaymentReviewRow>();

  return results ?? [];
}

/** GET /api/agent/payments/pending — payments awaiting review on this Agent's assigned units. */
export async function listPendingPayments(env: Env, actor: SessionUser): Promise<Response> {
  const payments = await selectAgentPayments(
    env,
    actor,
    "AND rent_payments.status = 'PENDING_REVIEW' ORDER BY rent_payments.submitted_at ASC",
  );
  return json({ payments });
}

async function getAssignedPayment(env: Env, actor: SessionUser, paymentId: string): Promise<AgentPaymentReviewRow | null> {
  const rows = await selectAgentPayments(env, actor, "AND rent_payments.id = ?", [paymentId]);
  return rows[0] ?? null;
}

/** GET /api/agent/payments/:id */
export async function getPaymentForReview(env: Env, actor: SessionUser, paymentId: string): Promise<Response> {
  const payment = await getAssignedPayment(env, actor, paymentId);
  if (!payment) return json({ error: "Payment not found." }, 404);
  return json({ payment });
}

/** GET /api/agent/payments/:id/receipt */
export async function getPaymentReceipt(env: Env, actor: SessionUser, paymentId: string): Promise<Response> {
  const payment = await getAssignedPayment(env, actor, paymentId);
  if (!payment) return new Response("Not found.", { status: 404 });
  return streamReceipt(env, payment);
}

/** POST /api/agent/payments/:id/confirm — PENDING_REVIEW -> PAYMENT_CONFIRMED. */
export async function confirmPayment(env: Env, actor: SessionUser, paymentId: string): Promise<Response> {
  return confirmPaymentCore(env, actor, paymentId, "AGENT", getAssignedPayment);
}

/** POST /api/agent/payments/:id/reject — PENDING_REVIEW -> WAITING_PAYMENT. */
export async function rejectPayment(request: Request, env: Env, actor: SessionUser, paymentId: string): Promise<Response> {
  return rejectPaymentCore(request, env, actor, paymentId, "AGENT", getAssignedPayment);
}
