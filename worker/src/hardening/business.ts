import type { Env, SessionUser } from "../types";
import { generateToken, hashToken } from "../auth/session";
import { INVITE_TTL_MS } from "../auth/routes";
import { getDepositBreakdown } from "../shared/deposits";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

interface ActiveOwnedUnit {
  id: string;
  property_id: string;
  label: string;
}

async function getActiveOwnedUnit(
  env: Env,
  actor: SessionUser,
  unitId: string,
): Promise<ActiveOwnedUnit | null> {
  const row = await env.DB.prepare(
    `SELECT u.id, u.property_id, u.label
     FROM units u
     JOIN properties p ON p.id = u.property_id
     WHERE u.id = ? AND p.owner_id = ?
       AND u.archived_at IS NULL AND p.archived_at IS NULL`,
  )
    .bind(unitId, actor.id)
    .first<ActiveOwnedUnit>();
  return row ?? null;
}

export async function guardCreateUnitOnActiveProperty(
  env: Env,
  actor: SessionUser,
  propertyId: string,
): Promise<Response | null> {
  const property = await env.DB.prepare(
    "SELECT archived_at FROM properties WHERE id = ? AND owner_id = ?",
  )
    .bind(propertyId, actor.id)
    .first<{ archived_at: string | null }>();

  if (property?.archived_at) {
    return json({ error: "Archived properties cannot receive new units." }, 409);
  }
  return null;
}

export async function createAgentHardened(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response> {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body?.phone === "string" && body.phone.trim() ? body.phone.trim() : null;

  if (!name || !email) return json({ error: "Name and email are required." }, 400);
  if (!isValidEmail(email)) return json({ error: "Enter a valid email address." }, 400);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return json({ error: "An account with this email already exists." }, 409);

  const agentId = crypto.randomUUID();
  const inviteToken = generateToken();
  const inviteTokenHash = await hashToken(inviteToken);
  const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

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
    ).bind(crypto.randomUUID(), actor.id, agentId, JSON.stringify({ email })),
  ]);

  return json(
    { agent: { id: agentId, name, email, phone }, inviteLink: `${env.FRONTEND_URL}/invite/${inviteToken}` },
    201,
  );
}

async function getOwnedAgent(env: Env, actor: SessionUser, agentId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT id FROM users WHERE id = ? AND role = 'AGENT' AND created_by = ?",
  )
    .bind(agentId, actor.id)
    .first();
  return Boolean(row);
}

export async function createAssignmentHardened(
  request: Request,
  env: Env,
  actor: SessionUser,
  agentId: string,
): Promise<Response> {
  if (!(await getOwnedAgent(env, actor, agentId))) return json({ error: "Agent not found." }, 404);

  const body = await request.json().catch(() => null);
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId.trim() : "";
  const unitId = typeof body?.unitId === "string" && body.unitId.trim() ? body.unitId.trim() : null;
  if (!propertyId) return json({ error: "propertyId is required." }, 400);

  const property = await env.DB.prepare(
    "SELECT id, archived_at FROM properties WHERE id = ? AND owner_id = ?",
  )
    .bind(propertyId, actor.id)
    .first<{ id: string; archived_at: string | null }>();
  if (!property) return json({ error: "Property not found." }, 404);
  if (property.archived_at) return json({ error: "Archived properties cannot receive agent assignments." }, 409);

  if (unitId) {
    const unit = await env.DB.prepare(
      "SELECT id, archived_at FROM units WHERE id = ? AND property_id = ?",
    )
      .bind(unitId, propertyId)
      .first<{ id: string; archived_at: string | null }>();
    if (!unit) return json({ error: "Unit not found on this property." }, 404);
    if (unit.archived_at) return json({ error: "Archived units cannot receive agent assignments." }, 409);
  }

  const overlap = unitId
    ? await env.DB.prepare(
        `SELECT id, unit_id FROM agent_assignments
         WHERE agent_id = ? AND property_id = ? AND (unit_id IS NULL OR unit_id = ?)
         LIMIT 1`,
      )
        .bind(agentId, propertyId, unitId)
        .first<{ id: string; unit_id: string | null }>()
    : await env.DB.prepare(
        `SELECT id, unit_id FROM agent_assignments
         WHERE agent_id = ? AND property_id = ? LIMIT 1`,
      )
        .bind(agentId, propertyId)
        .first<{ id: string; unit_id: string | null }>();

  if (overlap) {
    const message = unitId && overlap.unit_id === null
      ? "This agent is already assigned to the whole property."
      : !unitId && overlap.unit_id !== null
        ? "This agent already has unit assignments in this property. Remove them before assigning the whole property."
        : "This assignment already exists.";
    return json({ error: message }, 409);
  }

  const assignmentId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO agent_assignments (id, agent_id, property_id, unit_id) VALUES (?, ?, ?, ?)",
    ).bind(assignmentId, agentId, propertyId, unitId),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'AGENT_ASSIGNED', 'agent_assignment', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      actor.id,
      assignmentId,
      JSON.stringify({ agentId, propertyId, unitId }),
    ),
  ]);

  return json({ assignment: { id: assignmentId, agentId, propertyId, unitId } }, 201);
}

async function getCurrentUnitLeader(
  env: Env,
  unitId: string,
  excludeUserId?: string,
): Promise<{ id: string; name: string } | null> {
  const row = await env.DB.prepare(
    `SELECT id, name FROM users
     WHERE unit_id = ? AND role = 'UNIT_LEADER' AND status != 'INACTIVE' AND id != ?`,
  )
    .bind(unitId, excludeUserId ?? "")
    .first<{ id: string; name: string }>();
  return row ?? null;
}

export async function createUnitLeaderHardened(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response> {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body?.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
  const unitId = typeof body?.unitId === "string" ? body.unitId.trim() : "";
  const confirmReplace = body?.confirmReplace === true;

  if (!name || !email || !unitId) return json({ error: "Name, email, and unit are required." }, 400);
  if (!isValidEmail(email)) return json({ error: "Enter a valid email address." }, 400);

  const unit = await getActiveOwnedUnit(env, actor, unitId);
  if (!unit) return json({ error: "Active unit not found." }, 404);

  const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existingUser) return json({ error: "An account with this email already exists." }, 409);

  const currentLeader = await getCurrentUnitLeader(env, unitId);
  if (currentLeader && !confirmReplace) {
    return json(
      {
        error: `This unit already has a Unit Leader (${currentLeader.name}).`,
        currentLeader,
        requiresConfirmation: true,
      },
      409,
    );
  }

  const leaderId = crypto.randomUUID();
  const inviteToken = generateToken();
  const inviteTokenHash = await hashToken(inviteToken);
  const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const statements: D1PreparedStatement[] = [];

  // Release the old slot first. D1 batch is atomic, so the replacement cannot
  // leave production half-updated, and the DB uniqueness trigger sees a free
  // unit before the new leader is inserted.
  if (currentLeader) {
    statements.push(
      env.DB.prepare("UPDATE users SET unit_id = NULL WHERE id = ?").bind(currentLeader.id),
      env.DB.prepare(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
         VALUES (?, ?, 'UNIT_LEADER_UNASSIGNED', 'user', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        actor.id,
        currentLeader.id,
        JSON.stringify({ unitId, replacedBy: leaderId }),
      ),
    );
  }

  statements.push(
    env.DB.prepare(
      `INSERT INTO users (id, email, name, phone, role, password_hash, status, created_by, unit_id)
       VALUES (?, ?, ?, ?, 'UNIT_LEADER', NULL, 'WAITING_FOR_ACTIVATION', ?, ?)`,
    ).bind(leaderId, email, name, phone, actor.id, unitId),
    env.DB.prepare("INSERT INTO invitations (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(
      inviteTokenHash,
      leaderId,
      inviteExpiresAt,
    ),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'UNIT_LEADER_CREATED', 'user', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      actor.id,
      leaderId,
      JSON.stringify({ email, unitId, replacedLeaderId: currentLeader?.id ?? null }),
    ),
  );

  await env.DB.batch(statements);
  return json(
    {
      unitLeader: { id: leaderId, name, email, phone, unitId },
      inviteLink: `${env.FRONTEND_URL}/invite/${inviteToken}`,
    },
    201,
  );
}

export async function reassignUnitLeaderHardened(
  request: Request,
  env: Env,
  actor: SessionUser,
  leaderId: string,
): Promise<Response> {
  const leader = await env.DB.prepare(
    `SELECT id, name, unit_id, status FROM users
     WHERE id = ? AND role = 'UNIT_LEADER' AND created_by = ?`,
  )
    .bind(leaderId, actor.id)
    .first<{ id: string; name: string; unit_id: string | null; status: string }>();
  if (!leader) return json({ error: "Unit Leader not found." }, 404);
  if (leader.status === "INACTIVE") {
    return json({ error: "Reactivate this Unit Leader before assigning a unit." }, 409);
  }

  const body = await request.json().catch(() => null);
  const unitId = typeof body?.unitId === "string" ? body.unitId.trim() : "";
  const confirmReplace = body?.confirmReplace === true;
  if (!unitId) return json({ error: "unitId is required." }, 400);

  const unit = await getActiveOwnedUnit(env, actor, unitId);
  if (!unit) return json({ error: "Active unit not found." }, 404);

  const currentLeader = await getCurrentUnitLeader(env, unitId, leaderId);
  if (currentLeader && !confirmReplace) {
    return json(
      {
        error: `This unit already has a Unit Leader (${currentLeader.name}).`,
        currentLeader,
        requiresConfirmation: true,
      },
      409,
    );
  }

  const statements: D1PreparedStatement[] = [];
  if (currentLeader) {
    statements.push(
      env.DB.prepare("UPDATE users SET unit_id = NULL WHERE id = ?").bind(currentLeader.id),
      env.DB.prepare(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
         VALUES (?, ?, 'UNIT_LEADER_UNASSIGNED', 'user', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        actor.id,
        currentLeader.id,
        JSON.stringify({ unitId, replacedBy: leaderId }),
      ),
    );
  }

  statements.push(
    env.DB.prepare("UPDATE users SET unit_id = ? WHERE id = ?").bind(unitId, leaderId),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'UNIT_LEADER_REASSIGNED', 'user', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      actor.id,
      leaderId,
      JSON.stringify({ fromUnitId: leader.unit_id, toUnitId: unitId }),
    ),
  );

  await env.DB.batch(statements);
  return json({ ok: true });
}

export async function guardTenantTargetActive(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response | null> {
  const form = await request.clone().formData().catch(() => null);
  if (!form) return null;
  const propertyId = typeof form.get("propertyId") === "string" ? String(form.get("propertyId")) : "";
  const unitId = typeof form.get("unitId") === "string" ? String(form.get("unitId")) : "";
  if (!propertyId || !unitId) return null;

  const target = await env.DB.prepare(
    `SELECT p.owner_id, p.archived_at AS property_archived, u.archived_at AS unit_archived
     FROM properties p
     JOIN units u ON u.property_id = p.id
     WHERE p.id = ? AND u.id = ?`,
  )
    .bind(propertyId, unitId)
    .first<{ owner_id: string; property_archived: string | null; unit_archived: string | null }>();
  if (!target) return null;

  if (actor.role === "OWNER" && target.owner_id !== actor.id) return null;
  if (actor.role === "AGENT") {
    const assigned = await env.DB.prepare(
      `SELECT id FROM agent_assignments
       WHERE agent_id = ? AND property_id = ? AND (unit_id IS NULL OR unit_id = ?)
       LIMIT 1`,
    )
      .bind(actor.id, propertyId, unitId)
      .first();
    if (!assigned) return null;
  }

  if (target.property_archived || target.unit_archived) {
    return json({ error: "Archived properties or units cannot receive new tenants." }, 409);
  }
  return null;
}

export async function listAgentActiveProperties(env: Env, actor: SessionUser): Promise<Response> {
  const { results: assignments } = await env.DB.prepare(
    `SELECT aa.property_id, aa.unit_id, p.name, p.address
     FROM agent_assignments aa
     JOIN properties p ON p.id = aa.property_id
     WHERE aa.agent_id = ? AND p.archived_at IS NULL
     ORDER BY p.name`,
  )
    .bind(actor.id)
    .all<{ property_id: string; unit_id: string | null; name: string; address: string }>();

  const grouped = new Map<string, { id: string; name: string; address: string; whole: boolean; unitIds: Set<string> }>();
  for (const row of assignments ?? []) {
    const current = grouped.get(row.property_id) ?? {
      id: row.property_id,
      name: row.name,
      address: row.address,
      whole: false,
      unitIds: new Set<string>(),
    };
    if (row.unit_id === null) current.whole = true;
    else current.unitIds.add(row.unit_id);
    grouped.set(row.property_id, current);
  }

  const properties = [];
  for (const property of grouped.values()) {
    const { results: units } = await env.DB.prepare(
      `SELECT id, label, monthly_rent FROM units
       WHERE property_id = ? AND archived_at IS NULL ORDER BY label`,
    )
      .bind(property.id)
      .all<{ id: string; label: string; monthly_rent: number }>();

    properties.push({
      id: property.id,
      name: property.name,
      address: property.address,
      units: property.whole ? (units ?? []) : (units ?? []).filter((unit) => property.unitIds.has(unit.id)),
    });
  }

  return json({ properties });
}

async function actorCanManageLease(env: Env, actor: SessionUser, leaseId: string): Promise<boolean> {
  if (actor.role === "OWNER") {
    const row = await env.DB.prepare(
      `SELECT leases.id FROM leases
       JOIN units u ON u.id = leases.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE leases.id = ? AND p.owner_id = ?`,
    )
      .bind(leaseId, actor.id)
      .first();
    return Boolean(row);
  }
  if (actor.role === "AGENT") {
    const row = await env.DB.prepare(
      `SELECT leases.id FROM leases
       JOIN units u ON u.id = leases.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE leases.id = ? AND EXISTS (
         SELECT 1 FROM agent_assignments aa
         WHERE aa.agent_id = ? AND aa.property_id = p.id
           AND (aa.unit_id IS NULL OR aa.unit_id = u.id)
       )`,
    )
      .bind(leaseId, actor.id)
      .first();
    return Boolean(row);
  }
  return false;
}

async function refundableHeld(env: Env, leaseId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT
       COALESCE((
         SELECT SUM(dp.amount)
         FROM deposit_payments dp
         JOIN deposit_items di ON di.id = dp.deposit_item_id
         WHERE di.lease_id = ? AND di.refundable = 1
       ), 0) AS paid,
       COALESCE((SELECT SUM(amount) FROM deposit_deductions WHERE lease_id = ?), 0) AS deducted,
       COALESCE((SELECT SUM(amount) FROM deposit_returns WHERE lease_id = ?), 0) AS returned`,
  )
    .bind(leaseId, leaseId, leaseId)
    .first<{ paid: number; deducted: number; returned: number }>();
  return Math.max(0, (row?.paid ?? 0) - (row?.deducted ?? 0) - (row?.returned ?? 0));
}

export async function getHardenedDeposit(
  env: Env,
  actor: SessionUser,
  leaseId: string,
): Promise<Response> {
  if (!(await actorCanManageLease(env, actor, leaseId))) return json({ error: "Lease not found." }, 404);
  const breakdown = await getDepositBreakdown(env, leaseId);
  const held = await refundableHeld(env, leaseId);
  const refundablePaid = breakdown.items
    .filter((item) => item.refundable === 1)
    .reduce((sum, item) => sum + item.amountPaid, 0);

  const refundStatus = refundablePaid <= 0
    ? "NOT_APPLICABLE"
    : breakdown.summary.totalReturned <= 0
      ? "HELD"
      : held <= 0
        ? "FULLY_RETURNED"
        : "PARTIALLY_RETURNED";

  return json({
    ...breakdown,
    summary: {
      ...breakdown.summary,
      amountHeld: held,
      remainingRefundable: held,
      refundStatus,
    },
  });
}

export async function guardDepositPayment(
  request: Request,
  env: Env,
  actor: SessionUser,
  itemId: string,
): Promise<Response | null> {
  const item = await env.DB.prepare(
    "SELECT id, lease_id, total_amount FROM deposit_items WHERE id = ?",
  )
    .bind(itemId)
    .first<{ id: string; lease_id: string; total_amount: number }>();
  if (!item || !(await actorCanManageLease(env, actor, item.lease_id))) return null;

  const form = await request.clone().formData().catch(() => null);
  if (!form) return null;
  const amount = Number(form.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const amountCents = Math.round(amount * 100);

  const paid = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM deposit_payments WHERE deposit_item_id = ?",
  )
    .bind(itemId)
    .first<{ total: number }>();
  const outstanding = Math.max(0, item.total_amount - (paid?.total ?? 0));
  if (amountCents > outstanding) {
    return json({ error: "Payment cannot exceed the outstanding deposit item amount." }, 409);
  }
  return null;
}

export async function guardDepositDeduction(
  request: Request,
  env: Env,
  actor: SessionUser,
  leaseId: string,
): Promise<Response | null> {
  if (!(await actorCanManageLease(env, actor, leaseId))) return null;
  const form = await request.clone().formData().catch(() => null);
  if (!form) return null;
  const amount = Number(form.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const requested = Math.round(amount * 100);
  const held = await refundableHeld(env, leaseId);
  if (held <= 0) return json({ error: "There is no refundable deposit balance left to deduct." }, 409);
  if (requested > held) return json({ error: "Deduction cannot exceed the refundable deposit balance held." }, 409);
  return null;
}

export async function guardDepositReturn(
  request: Request,
  env: Env,
  actor: SessionUser,
  leaseId: string,
): Promise<Response | null> {
  if (!(await actorCanManageLease(env, actor, leaseId))) return null;
  const body = await request.clone().json().catch(() => null);
  const amount = Number(body?.amountDollars);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const requested = Math.round(amount * 100);
  const held = await refundableHeld(env, leaseId);
  if (held <= 0) return json({ error: "There is no refundable deposit balance left to return." }, 409);
  if (requested > held) return json({ error: "Return cannot exceed the refundable deposit balance held." }, 409);
  return null;
}
