import type { Env, SessionUser } from "../types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface ActiveLeaseTarget {
  lease_id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_role: string;
}

/**
 * A Unit Leader is an existing tenant in the unit with extra utility duties.
 * This keeps the same account, lease, rent, deposit and documents intact.
 */
export async function assignTenantAsUnitLeader(
  request: Request,
  env: Env,
  actor: SessionUser,
  unitId: string,
): Promise<Response> {
  const body = await request.json().catch(() => null);
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";
  if (!tenantId) return json({ error: "tenantId is required." }, 400);

  const target = await env.DB.prepare(
    `SELECT l.id AS lease_id, l.tenant_id, t.name AS tenant_name, t.role AS tenant_role
     FROM leases l
     JOIN users t ON t.id = l.tenant_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE l.unit_id = ? AND l.tenant_id = ? AND l.status = 'ACTIVE'
       AND p.owner_id = ? AND u.archived_at IS NULL AND p.archived_at IS NULL`,
  )
    .bind(unitId, tenantId, actor.id)
    .first<ActiveLeaseTarget>();

  if (!target) return json({ error: "Active tenant not found in this unit." }, 404);
  if (target.tenant_role !== "TENANT" && target.tenant_role !== "UNIT_LEADER") {
    return json({ error: "Only an active tenant can be assigned as Unit Leader." }, 409);
  }

  const current = await env.DB.prepare(
    `SELECT u.id, u.name
     FROM users u
     WHERE u.role = 'UNIT_LEADER' AND u.unit_id = ? AND u.status != 'INACTIVE' AND u.id != ?
     LIMIT 1`,
  )
    .bind(unitId, tenantId)
    .first<{ id: string; name: string }>();

  const statements: D1PreparedStatement[] = [];
  if (current) {
    statements.push(
      env.DB.prepare("UPDATE users SET role='TENANT', unit_id=NULL WHERE id=?").bind(current.id),
      env.DB.prepare(
        "UPDATE leases SET is_unit_leader=0 WHERE tenant_id=? AND unit_id=? AND status='ACTIVE'",
      ).bind(current.id, unitId),
      env.DB.prepare(
        `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,metadata)
         VALUES (?,?,'UNIT_LEADER_UNASSIGNED','user',?,?)`,
      ).bind(crypto.randomUUID(), actor.id, current.id, JSON.stringify({ unitId, replacedBy: tenantId })),
    );
  }

  statements.push(
    env.DB.prepare("UPDATE users SET role='UNIT_LEADER', unit_id=? WHERE id=?").bind(unitId, tenantId),
    env.DB.prepare("UPDATE leases SET is_unit_leader=1 WHERE id=?").bind(target.lease_id),
    env.DB.prepare(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,metadata)
       VALUES (?,?,'TENANT_ASSIGNED_UNIT_LEADER','user',?,?)`,
    ).bind(
      crypto.randomUUID(),
      actor.id,
      tenantId,
      JSON.stringify({ unitId, leaseId: target.lease_id, replacedLeaderId: current?.id ?? null }),
    ),
  );

  await env.DB.batch(statements);
  return json({
    ok: true,
    unitLeader: { id: tenantId, name: target.tenant_name, unitId, leaseId: target.lease_id },
  });
}

export async function removeTenantUnitLeader(
  env: Env,
  actor: SessionUser,
  unitId: string,
): Promise<Response> {
  const current = await env.DB.prepare(
    `SELECT ul.id
     FROM users ul
     JOIN units u ON u.id = ul.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE ul.role='UNIT_LEADER' AND ul.unit_id=? AND p.owner_id=?
     LIMIT 1`,
  )
    .bind(unitId, actor.id)
    .first<{ id: string }>();
  if (!current) return json({ error: "This unit has no Unit Leader." }, 404);

  await env.DB.batch([
    env.DB.prepare("UPDATE users SET role='TENANT', unit_id=NULL WHERE id=?").bind(current.id),
    env.DB.prepare(
      "UPDATE leases SET is_unit_leader=0 WHERE tenant_id=? AND unit_id=? AND status='ACTIVE'",
    ).bind(current.id, unitId),
    env.DB.prepare(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,metadata)
       VALUES (?,?,'UNIT_LEADER_UNASSIGNED','user',?,?)`,
    ).bind(crypto.randomUUID(), actor.id, current.id, JSON.stringify({ unitId })),
  ]);

  return json({ ok: true });
}
