import type { Env, SessionUser } from "../types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function dueDateFor(month: string, dueDay: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(Math.max(1, dueDay || 1), last)).padStart(2, "0")}`;
}

/**
 * The legacy tenancy-move route originally accepted role=TENANT only.
 * Handle the same operation for a Unit Leader, then drop the extra utility
 * responsibility so the Owner can explicitly assign a leader in the new unit.
 */
export async function handleUnitLeaderLifecycleRoute(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response | null> {
  if (actor.role !== "OWNER" || request.method !== "POST") return null;
  const match = new URL(request.url).pathname.match(/^\/api\/owner\/tenants\/([^/]+)\/move$/);
  if (!match) return null;
  const tenantId = match[1];

  const user = await env.DB.prepare("SELECT id, role FROM users WHERE id=?").bind(tenantId).first<{ id: string; role: string }>();
  if (!user || user.role !== "UNIT_LEADER") return null;

  const body = await request.json().catch(() => null);
  const unitId = typeof body?.unitId === "string" ? body.unitId.trim() : "";
  const startDate = typeof body?.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
    ? body.startDate
    : "";
  if (!unitId || !startDate) return json({ error: "New unit and start date are required." }, 400);

  const target = await env.DB.prepare(
    `SELECT u.id,u.monthly_rent FROM units u JOIN properties p ON p.id=u.property_id
     WHERE u.id=? AND p.owner_id=? AND u.archived_at IS NULL AND p.archived_at IS NULL`,
  ).bind(unitId, actor.id).first<{ id: string; monthly_rent: number }>();
  if (!target) return json({ error: "New unit not found." }, 404);

  const occupied = await env.DB.prepare("SELECT id FROM leases WHERE unit_id=? AND status='ACTIVE'").bind(unitId).first();
  if (occupied) return json({ error: "The selected unit already has an active tenancy." }, 409);

  const current = await env.DB.prepare(
    `SELECT l.id,l.due_day FROM leases l
     JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id
     WHERE l.tenant_id=? AND l.status='ACTIVE' AND p.owner_id=?
     ORDER BY l.created_at DESC LIMIT 1`,
  ).bind(tenantId, actor.id).first<{ id: string; due_day: number | null }>();
  if (!current) return json({ error: "Active tenancy not found." }, 404);

  const dueDay = Math.min(31, Math.max(1, Number(body?.dueDay ?? current.due_day ?? 1)));
  const deposit = Math.max(0, Math.round(Number(body?.deposit ?? 0) * 100));
  const leaseId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  const month = startDate.slice(0, 7);
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE leases SET status='ENDED',end_date=?,move_out_date=?,ended_at=?,is_unit_leader=0 WHERE id=?",
    ).bind(startDate, startDate, now, current.id),
    env.DB.prepare("UPDATE users SET role='TENANT',unit_id=NULL,status='ACTIVE' WHERE id=?").bind(tenantId),
    env.DB.prepare(
      `INSERT INTO leases (id,unit_id,tenant_id,monthly_rent,start_date,due_day,deposit,status,is_unit_leader)
       VALUES (?,?,?,?,?,?,?,'ACTIVE',0)`,
    ).bind(leaseId, unitId, tenantId, target.monthly_rent, startDate, dueDay, deposit),
    env.DB.prepare(
      `INSERT INTO rent_payments (id,lease_id,month,amount,due_date,status)
       VALUES (?,?,?,?,?,'WAITING_PAYMENT')`,
    ).bind(paymentId, leaseId, month, target.monthly_rent, dueDateFor(month, dueDay)),
    env.DB.prepare(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,metadata)
       VALUES (?,?, 'TENANT_MOVED','lease',?,?)`,
    ).bind(
      crypto.randomUUID(),
      actor.id,
      leaseId,
      JSON.stringify({ tenantId, fromLeaseId: current.id, unitId, startDate, removedUnitLeaderRole: true }),
    ),
  ]);

  return json({ ok: true, leaseId });
}
