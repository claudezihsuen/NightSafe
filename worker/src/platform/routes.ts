import type { Env, SessionUser } from "../types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dueDateFor(month: string, dueDay: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(Math.max(1, dueDay || 1), last)).padStart(2, "0")}`;
}

async function ownerDashboard(env: Env, actor: SessionUser): Promise<Response> {
  const portfolio = await env.DB.prepare(
    `SELECT
       COUNT(DISTINCT p.id) AS properties,
       COUNT(DISTINCT u.id) AS units,
       COUNT(DISTINCT CASE WHEN l.status='ACTIVE' THEN l.tenant_id END) AS tenants
     FROM properties p
     LEFT JOIN units u ON u.property_id=p.id AND u.archived_at IS NULL
     LEFT JOIN leases l ON l.unit_id=u.id
     WHERE p.owner_id=? AND p.archived_at IS NULL`,
  ).bind(actor.id).first<{ properties: number; units: number; tenants: number }>();
  const finance = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN rp.status='PAYMENT_CONFIRMED' THEN rp.amount ELSE 0 END),0) AS confirmed,
       COALESCE(SUM(CASE WHEN rp.status!='PAYMENT_CONFIRMED' THEN rp.amount ELSE 0 END),0) AS outstanding,
       COALESCE(SUM(rp.amount),0) AS expected,
       SUM(CASE WHEN rp.status='PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN rp.status='WAITING_PAYMENT' AND rp.due_date < date('now') THEN 1 ELSE 0 END) AS overdue
     FROM rent_payments rp
     JOIN leases l ON l.id=rp.lease_id
     JOIN units u ON u.id=l.unit_id
     JOIN properties p ON p.id=u.property_id
     WHERE p.owner_id=? AND rp.month=?`,
  ).bind(actor.id, monthKey()).first<{ confirmed: number; outstanding: number; expected: number; pending: number; overdue: number }>();
  const utilities = await env.DB.prepare(
    `SELECT COUNT(*) AS pending FROM utility_payments up
     JOIN units u ON u.id=up.unit_id JOIN properties p ON p.id=u.property_id
     WHERE p.owner_id=? AND up.status='PENDING_REVIEW'`,
  ).bind(actor.id).first<{ pending: number }>();
  return json({
    properties: portfolio?.properties ?? 0,
    units: portfolio?.units ?? 0,
    tenants: portfolio?.tenants ?? 0,
    expectedRent: finance?.expected ?? 0,
    confirmedRent: finance?.confirmed ?? 0,
    outstandingRent: finance?.outstanding ?? 0,
    pendingReviews: (finance?.pending ?? 0) + (utilities?.pending ?? 0),
    overduePayments: finance?.overdue ?? 0,
    month: monthKey(),
  });
}

async function agentDashboard(env: Env, actor: SessionUser): Promise<Response> {
  const scope = `EXISTS (
    SELECT 1 FROM agent_assignments aa
    WHERE aa.agent_id=? AND aa.property_id=p.id AND (aa.unit_id IS NULL OR aa.unit_id=u.id)
  )`;
  const counts = await env.DB.prepare(
    `SELECT COUNT(DISTINCT u.id) AS units,
            COUNT(DISTINCT CASE WHEN l.status='ACTIVE' THEN l.tenant_id END) AS tenants
     FROM units u JOIN properties p ON p.id=u.property_id
     LEFT JOIN leases l ON l.unit_id=u.id
     WHERE u.archived_at IS NULL AND p.archived_at IS NULL AND ${scope}`,
  ).bind(actor.id).first<{ units: number; tenants: number }>();
  const rent = await env.DB.prepare(
    `SELECT SUM(CASE WHEN rp.status='PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN rp.status='WAITING_PAYMENT' AND rp.due_date < date('now') THEN 1 ELSE 0 END) AS overdue
     FROM rent_payments rp JOIN leases l ON l.id=rp.lease_id
     JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id
     WHERE ${scope}`,
  ).bind(actor.id).first<{ pending: number; overdue: number }>();
  const utilities = await env.DB.prepare(
    `SELECT COUNT(*) AS pending FROM utility_payments up
     JOIN units u ON u.id=up.unit_id JOIN properties p ON p.id=u.property_id
     WHERE up.status='PENDING_REVIEW' AND ${scope}`,
  ).bind(actor.id).first<{ pending: number }>();
  return json({
    units: counts?.units ?? 0,
    tenants: counts?.tenants ?? 0,
    pendingReviews: (rent?.pending ?? 0) + (utilities?.pending ?? 0),
    overduePayments: rent?.overdue ?? 0,
  });
}

async function unitLeaderDashboard(env: Env, actor: SessionUser): Promise<Response> {
  const unit = await env.DB.prepare(
    `SELECT u.id, u.label, p.name AS propertyName
     FROM units u JOIN properties p ON p.id=u.property_id WHERE u.id=?`,
  ).bind(actor.unitId).first();
  const { results } = actor.unitId
    ? await env.DB.prepare(
      `SELECT id, type, month, amount, status, submitted_at FROM utility_payments
       WHERE unit_id=? ORDER BY month DESC, type`,
    ).bind(actor.unitId).all<{ id: string; type: string; month: string; amount: number; status: string; submitted_at: string | null }>()
    : { results: [] as { id: string; type: string; month: string; amount: number; status: string; submitted_at: string | null }[] };
  const utilities = results ?? [];
  const latest = (type: string) => utilities.find((u) => u.type === type) ?? null;
  return json({
    unit: unit ?? null,
    water: latest("WATER"),
    electricity: latest("ELECTRICITY"),
    pendingUtilityPayments: utilities.filter((u) => u.status !== "PAYMENT_CONFIRMED").length,
  });
}

async function tenantDashboard(env: Env, actor: SessionUser): Promise<Response> {
  const lease = await env.DB.prepare(
    `SELECT l.id, l.due_day, l.monthly_rent, p.name AS propertyName, u.label AS unitLabel
     FROM leases l JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id
     WHERE l.tenant_id=? AND l.status='ACTIVE' ORDER BY l.created_at DESC LIMIT 1`,
  ).bind(actor.id).first<{ id: string; due_day: number | null; monthly_rent: number; propertyName: string; unitLabel: string }>();
  if (!lease) return json({ tenancy: null, recentPayments: [], unreadNotifications: 0, documentationCount: 0 });
  const current = await env.DB.prepare(
    `SELECT id, month, amount, due_date, status FROM rent_payments WHERE lease_id=? AND month=?`,
  ).bind(lease.id, monthKey()).first();
  const { results: recent } = await env.DB.prepare(
    `SELECT id, month, amount, due_date, status FROM rent_payments WHERE lease_id=? ORDER BY month DESC LIMIT 4`,
  ).bind(lease.id).all();
  const unread = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND read_at IS NULL",
  ).bind(actor.id).first<{ count: number }>();
  const docs = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM documents WHERE lease_id=? AND tenant_visible=1 AND archived_at IS NULL`,
  ).bind(lease.id).first<{ count: number }>();
  return json({
    tenancy: { id: lease.id, propertyName: lease.propertyName, unitLabel: lease.unitLabel },
    currentRent: current ?? { month: monthKey(), amount: lease.monthly_rent, due_date: dueDateFor(monthKey(), lease.due_day ?? 1), status: "WAITING_PAYMENT" },
    recentPayments: recent ?? [],
    unreadNotifications: unread?.count ?? 0,
    documentationCount: docs?.count ?? 0,
  });
}

async function listNotifications(env: Env, actor: SessionUser): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, title, body, type, related_type, related_id, href, read_at, created_at
     FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100`,
  ).bind(actor.id).all();
  const unread = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND read_at IS NULL",
  ).bind(actor.id).first<{ count: number }>();
  return json({ notifications: results ?? [], unreadCount: unread?.count ?? 0 });
}

async function markNotificationRead(env: Env, actor: SessionUser, id: string): Promise<Response> {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    "UPDATE notifications SET read_at=COALESCE(read_at, ?) WHERE id=? AND user_id=?",
  ).bind(now, id, actor.id).run();
  if ((result.meta.changes ?? 0) !== 1) return json({ error: "Notification not found." }, 404);
  return json({ ok: true, readAt: now });
}

async function markAllRead(env: Env, actor: SessionUser): Promise<Response> {
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL")
    .bind(now, actor.id).run();
  return json({ ok: true, readAt: now });
}

async function getOwnerLifecycle(env: Env, actor: SessionUser): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT t.id AS tenantId, t.name, t.email, t.status AS accountStatus,
            l.id AS leaseId, l.status AS leaseStatus, l.start_date AS startDate,
            l.end_date AS endDate, l.move_out_date AS moveOutDate, l.end_reason AS endReason,
            l.final_notes AS finalNotes, p.id AS propertyId, p.name AS propertyName,
            u.id AS unitId, u.label AS unitLabel
     FROM leases l JOIN users t ON t.id=l.tenant_id
     JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id
     WHERE p.owner_id=? ORDER BY t.name, l.created_at DESC`,
  ).bind(actor.id).all();
  const { results: properties } = await env.DB.prepare(
    `SELECT p.id AS propertyId, p.name AS propertyName, u.id AS unitId, u.label AS unitLabel,
            u.monthly_rent AS monthlyRent
     FROM properties p JOIN units u ON u.property_id=p.id
     WHERE p.owner_id=? AND p.archived_at IS NULL AND u.archived_at IS NULL
     ORDER BY p.name, u.label`,
  ).bind(actor.id).all();
  return json({ tenancies: results ?? [], availableUnits: properties ?? [] });
}

async function endTenancy(request: Request, env: Env, actor: SessionUser, leaseId: string): Promise<Response> {
  const body = await request.json().catch(() => null);
  const moveOutDate = typeof body?.moveOutDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.moveOutDate)
    ? body.moveOutDate
    : new Date().toISOString().slice(0, 10);
  const lease = await env.DB.prepare(
    `SELECT l.id, l.tenant_id FROM leases l JOIN units u ON u.id=l.unit_id
     JOIN properties p ON p.id=u.property_id WHERE l.id=? AND p.owner_id=? AND l.status='ACTIVE'`,
  ).bind(leaseId, actor.id).first<{ id: string; tenant_id: string }>();
  if (!lease) return json({ error: "Active tenancy not found." }, 404);
  const now = new Date().toISOString();
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) || null : null;
  const notes = typeof body?.finalNotes === "string" ? body.finalNotes.trim().slice(0, 2000) || null : null;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE leases SET status='ENDED', end_date=?, move_out_date=?, end_reason=?, final_notes=?, ended_at=? WHERE id=?`,
    ).bind(moveOutDate, moveOutDate, reason, notes, now, lease.id),
    env.DB.prepare("UPDATE users SET status='INACTIVE' WHERE id=? AND role='TENANT'").bind(lease.tenant_id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(lease.tenant_id),
    env.DB.prepare(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,metadata)
       VALUES (?,?, 'TENANCY_ENDED','lease',?,?)`,
    ).bind(crypto.randomUUID(), actor.id, lease.id, JSON.stringify({ moveOutDate, reason })),
  ]);
  return json({ ok: true, tenantId: lease.tenant_id, leaseId: lease.id });
}

async function moveTenant(request: Request, env: Env, actor: SessionUser, tenantId: string): Promise<Response> {
  const body = await request.json().catch(() => null);
  const unitId = typeof body?.unitId === "string" ? body.unitId : "";
  const startDate = typeof body?.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ? body.startDate : "";
  if (!unitId || !startDate) return json({ error: "New unit and start date are required." }, 400);
  const target = await env.DB.prepare(
    `SELECT u.id, u.monthly_rent, p.id AS property_id FROM units u JOIN properties p ON p.id=u.property_id
     WHERE u.id=? AND p.owner_id=? AND u.archived_at IS NULL AND p.archived_at IS NULL`,
  ).bind(unitId, actor.id).first<{ id: string; monthly_rent: number; property_id: string }>();
  if (!target) return json({ error: "New unit not found." }, 404);
  const occupied = await env.DB.prepare("SELECT id FROM leases WHERE unit_id=? AND status='ACTIVE'").bind(unitId).first();
  if (occupied) return json({ error: "The selected unit already has an active tenancy." }, 409);
  const tenant = await env.DB.prepare("SELECT id, role FROM users WHERE id=? AND role='TENANT'").bind(tenantId).first();
  if (!tenant) return json({ error: "Tenant not found." }, 404);
  const current = await env.DB.prepare(
    `SELECT l.id, l.due_day FROM leases l JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id
     WHERE l.tenant_id=? AND l.status='ACTIVE' AND p.owner_id=? ORDER BY l.created_at DESC LIMIT 1`,
  ).bind(tenantId, actor.id).first<{ id: string; due_day: number | null }>();
  const dueDay = Math.min(31, Math.max(1, Number(body?.dueDay ?? current?.due_day ?? 1)));
  const deposit = Math.max(0, Math.round(Number(body?.deposit ?? 0) * 100));
  const leaseId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  const month = startDate.slice(0, 7);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (current) {
    statements.push(env.DB.prepare(
      `UPDATE leases SET status='ENDED', end_date=?, move_out_date=?, ended_at=? WHERE id=?`,
    ).bind(startDate, startDate, now, current.id));
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO leases (id,unit_id,tenant_id,monthly_rent,start_date,due_day,deposit,status)
       VALUES (?,?,?,?,?,?,?,'ACTIVE')`,
    ).bind(leaseId, unitId, tenantId, target.monthly_rent, startDate, dueDay, deposit),
    env.DB.prepare(
      `INSERT INTO rent_payments (id,lease_id,month,amount,due_date,status)
       VALUES (?,?,?,?,?,'WAITING_PAYMENT')`,
    ).bind(paymentId, leaseId, month, target.monthly_rent, dueDateFor(month, dueDay)),
    env.DB.prepare("UPDATE users SET status='ACTIVE' WHERE id=?").bind(tenantId),
    env.DB.prepare(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,metadata)
       VALUES (?,?, 'TENANT_MOVED','lease',?,?)`,
    ).bind(crypto.randomUUID(), actor.id, leaseId, JSON.stringify({ tenantId, fromLeaseId: current?.id ?? null, unitId, startDate })),
  );
  await env.DB.batch(statements);
  return json({ ok: true, leaseId });
}

async function collectTenantFiles(env: Env, tenantId: string): Promise<Set<string>> {
  const keys = new Set<string>();
  const add = (value: string | null | undefined) => { if (value) keys.add(value); };
  const queries = [
    ["SELECT receipt_key AS k FROM rent_payments rp JOIN leases l ON l.id=rp.lease_id WHERE l.tenant_id=? AND receipt_key IS NOT NULL", tenantId],
    ["SELECT a.file_key AS k FROM agreements a WHERE a.tenant_id=?", tenantId],
    ["SELECT d.object_key AS k FROM documents d WHERE d.tenant_id=? AND d.object_key IS NOT NULL", tenantId],
    ["SELECT dv.object_key AS k FROM document_versions dv JOIN documents d ON d.id=dv.document_id WHERE d.tenant_id=? AND dv.object_key IS NOT NULL", tenantId],
    ["SELECT v.signature_key AS k FROM document_field_values v WHERE v.tenant_id=? AND v.signature_key IS NOT NULL", tenantId],
    ["SELECT dp.receipt_key AS k FROM deposit_payments dp JOIN deposit_items di ON di.id=dp.deposit_item_id JOIN leases l ON l.id=di.lease_id WHERE l.tenant_id=? AND dp.receipt_key IS NOT NULL", tenantId],
    ["SELECT dd.receipt_key AS k FROM deposit_deductions dd JOIN leases l ON l.id=dd.lease_id WHERE l.tenant_id=? AND dd.receipt_key IS NOT NULL", tenantId],
  ] as const;
  for (const [sql, arg] of queries) {
    const { results } = await env.DB.prepare(sql).bind(arg).all<{ k: string | null }>();
    for (const row of results ?? []) add(row.k);
  }
  return keys;
}

async function permanentDeleteTenant(request: Request, env: Env, actor: SessionUser, tenantId: string): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (body?.confirm !== "DELETE") return json({ error: "Type DELETE to confirm permanent deletion." }, 400);
  const tenant = await env.DB.prepare(
    `SELECT u.id,u.name,u.email FROM users u WHERE u.id=? AND u.role='TENANT' AND EXISTS (
       SELECT 1 FROM leases l JOIN units un ON un.id=l.unit_id JOIN properties p ON p.id=un.property_id
       WHERE l.tenant_id=u.id AND p.owner_id=?
     )`,
  ).bind(tenantId, actor.id).first<{ id: string; name: string; email: string }>();
  if (!tenant) return json({ error: "Tenant not found." }, 404);
  const active = await env.DB.prepare("SELECT id FROM leases WHERE tenant_id=? AND status='ACTIVE'").bind(tenantId).first();
  if (active) return json({ error: "End the active tenancy before permanent deletion." }, 409);
  const keys = await collectTenantFiles(env, tenantId);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM notifications WHERE user_id=?").bind(tenantId),
    env.DB.prepare("DELETE FROM agreements WHERE tenant_id=?").bind(tenantId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(tenantId),
    env.DB.prepare("DELETE FROM invitations WHERE user_id=?").bind(tenantId),
    env.DB.prepare("DELETE FROM users WHERE id=?").bind(tenantId),
    env.DB.prepare(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,metadata)
       VALUES (?,?, 'TENANT_PERMANENTLY_DELETED','user',?,?)`,
    ).bind(crypto.randomUUID(), actor.id, tenantId, JSON.stringify({ email: tenant.email, fileCount: keys.size })),
  ]);
  let failed = 0;
  for (const key of keys) {
    try { await env.FILES.delete(key); } catch { failed += 1; }
  }
  return json({ ok: true, filesDeleted: keys.size - failed, fileDeleteFailures: failed });
}

async function getRetention(env: Env, actor: SessionUser): Promise<Response> {
  await env.DB.prepare("INSERT OR IGNORE INTO retention_settings (owner_id) VALUES (?)").bind(actor.id).run();
  const row = await env.DB.prepare("SELECT * FROM retention_settings WHERE owner_id=?").bind(actor.id).first();
  return json({ retention: row });
}

async function setRetention(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const body = await request.json().catch(() => null);
  const months = Math.min(60, Math.max(1, Math.round(Number(body?.retentionMonths ?? 12))));
  await env.DB.prepare(
    `INSERT INTO retention_settings (owner_id,retention_months,updated_at) VALUES (?,?,?)
     ON CONFLICT(owner_id) DO UPDATE SET retention_months=excluded.retention_months,updated_at=excluded.updated_at`,
  ).bind(actor.id, months, new Date().toISOString()).run();
  return getRetention(env, actor);
}

/** Returns null when request is not handled here. */
export async function handlePlatformRoute(request: Request, env: Env, actor: SessionUser): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const method = request.method;
  if (path === "/api/owner/dashboard" && actor.role === "OWNER" && method === "GET") return ownerDashboard(env, actor);
  if (path === "/api/agent/dashboard" && actor.role === "AGENT" && method === "GET") return agentDashboard(env, actor);
  if (path === "/api/unit-leader/dashboard" && actor.role === "UNIT_LEADER" && method === "GET") return unitLeaderDashboard(env, actor);
  if (path === "/api/tenant/dashboard" && actor.role === "TENANT" && method === "GET") return tenantDashboard(env, actor);

  if (path === "/api/tenant/notifications" && actor.role === "TENANT" && method === "GET") return listNotifications(env, actor);
  if (path === "/api/tenant/notifications/read-all" && actor.role === "TENANT" && method === "POST") return markAllRead(env, actor);
  const notificationRead = path.match(/^\/api\/tenant\/notifications\/([^/]+)\/read$/);
  if (notificationRead && actor.role === "TENANT" && method === "POST") return markNotificationRead(env, actor, notificationRead[1]);

  if (path === "/api/owner/lifecycle" && actor.role === "OWNER" && method === "GET") return getOwnerLifecycle(env, actor);
  const end = path.match(/^\/api\/owner\/tenancies\/([^/]+)\/end$/);
  if (end && actor.role === "OWNER" && method === "POST") return endTenancy(request, env, actor, end[1]);
  const move = path.match(/^\/api\/owner\/tenants\/([^/]+)\/move$/);
  if (move && actor.role === "OWNER" && method === "POST") return moveTenant(request, env, actor, move[1]);
  const remove = path.match(/^\/api\/owner\/tenants\/([^/]+)\/permanent-delete$/);
  if (remove && actor.role === "OWNER" && method === "POST") return permanentDeleteTenant(request, env, actor, remove[1]);
  if (path === "/api/owner/retention" && actor.role === "OWNER" && method === "GET") return getRetention(env, actor);
  if (path === "/api/owner/retention" && actor.role === "OWNER" && method === "PATCH") return setRetention(request, env, actor);
  return null;
}

async function insertNotification(
  env: Env,
  userId: string,
  title: string,
  body: string,
  type: string,
  relatedType: string,
  relatedId: string,
  href: string,
  dedupeKey: string,
) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO notifications
     (id,user_id,title,body,type,related_type,related_id,href,dedupe_key)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(crypto.randomUUID(), userId, title, body, type, relatedType, relatedId, href, dedupeKey).run();
}

async function ensureCurrentRent(env: Env) {
  const currentMonth = monthKey();
  let cursor = "";
  for (let page = 0; page < 20; page += 1) {
    const { results } = await env.DB.prepare(
      `SELECT id,monthly_rent,due_day FROM leases
       WHERE status='ACTIVE' AND id>? ORDER BY id LIMIT 200`,
    ).bind(cursor).all<{ id: string; monthly_rent: number; due_day: number | null }>();
    const rows = results ?? [];
    if (!rows.length) break;
    const statements = rows.map((lease) => env.DB.prepare(
      `INSERT OR IGNORE INTO rent_payments (id,lease_id,month,amount,due_date,status)
       VALUES (?,?,?,?,?,'WAITING_PAYMENT')`,
    ).bind(crypto.randomUUID(), lease.id, currentMonth, lease.monthly_rent, dueDateFor(currentMonth, lease.due_day ?? 1)));
    await env.DB.batch(statements);
    cursor = rows[rows.length - 1].id;
  }
}

async function sendRentNotifications(env: Env) {
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const soon = new Date(today.getTime() + 3 * 86400000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT rp.id,rp.month,rp.due_date,rp.status,l.tenant_id
     FROM rent_payments rp JOIN leases l ON l.id=rp.lease_id
     WHERE l.status='ACTIVE' AND rp.status='WAITING_PAYMENT'
       AND rp.due_date<=? ORDER BY rp.due_date LIMIT 500`,
  ).bind(soon).all<{ id: string; month: string; due_date: string; status: string; tenant_id: string }>();
  for (const row of results ?? []) {
    const overdue = row.due_date < isoToday;
    await insertNotification(
      env,
      row.tenant_id,
      overdue ? "Rent overdue" : "Rent due soon",
      overdue ? `Rent for ${row.month} is overdue.` : `Rent for ${row.month} is due on ${row.due_date}.`,
      overdue ? "RENT_OVERDUE" : "RENT_DUE_SOON",
      "rent_payment",
      row.id,
      `/tenant/payments/${row.id}`,
      `${overdue ? "rent-overdue" : "rent-due-soon"}:${row.id}`,
    );
  }
}

async function sendUtilityNotifications(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT up.id,up.type,up.month,u.id AS unit_id,ul.id AS leader_id
     FROM utility_payments up JOIN units u ON u.id=up.unit_id
     JOIN users ul ON ul.unit_id=u.id AND ul.role='UNIT_LEADER' AND ul.status='ACTIVE'
     WHERE up.status='WAITING_PAYMENT' ORDER BY up.month DESC LIMIT 500`,
  ).all<{ id: string; type: string; month: string; unit_id: string; leader_id: string }>();
  for (const row of results ?? []) {
    await insertNotification(
      env,
      row.leader_id,
      "Utility payment required",
      `${row.type === "WATER" ? "Water" : "Electricity"} for ${row.month} is waiting for payment.`,
      "UTILITY_PAYMENT_REQUIRED",
      "utility_payment",
      row.id,
      row.type === "WATER" ? "/unit-leader/water" : "/unit-leader/electricity",
      `utility-required:${row.id}`,
    );
  }
}

async function cleanupEndedLeases(env: Env) {
  const { results: owners } = await env.DB.prepare(
    `SELECT u.id AS owner_id, COALESCE(rs.retention_months,12) AS months
     FROM users u LEFT JOIN retention_settings rs ON rs.owner_id=u.id
     WHERE u.role='OWNER' AND u.status='ACTIVE'`,
  ).all<{ owner_id: string; months: number }>();
  for (const owner of owners ?? []) {
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - owner.months);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const { results: leases } = await env.DB.prepare(
      `SELECT l.id,l.tenant_id FROM leases l JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id
       WHERE p.owner_id=? AND l.status='ENDED' AND COALESCE(l.ended_at,l.end_date,l.created_at)<?
       ORDER BY COALESCE(l.ended_at,l.end_date,l.created_at) LIMIT 50`,
    ).bind(owner.owner_id, cutoffDate).all<{ id: string; tenant_id: string }>();
    let cleaned = 0;
    let fileFailures = 0;
    for (const lease of leases ?? []) {
      const active = await env.DB.prepare("SELECT id FROM leases WHERE tenant_id=? AND status='ACTIVE' LIMIT 1")
        .bind(lease.tenant_id).first();
      // Historical tenancy may be deleted even when the same account has a new active tenancy;
      // only this ended lease's records/files are collected.
      const keys = new Set<string>();
      const queries = [
        "SELECT receipt_key AS k FROM rent_payments WHERE lease_id=? AND receipt_key IS NOT NULL",
        "SELECT file_key AS k FROM agreements WHERE lease_id=?",
        "SELECT object_key AS k FROM documents WHERE lease_id=? AND object_key IS NOT NULL",
        "SELECT dv.object_key AS k FROM document_versions dv JOIN documents d ON d.id=dv.document_id WHERE d.lease_id=? AND dv.object_key IS NOT NULL",
        "SELECT v.signature_key AS k FROM document_field_values v JOIN documents d ON d.id=v.document_id WHERE d.lease_id=? AND v.signature_key IS NOT NULL",
        "SELECT dp.receipt_key AS k FROM deposit_payments dp JOIN deposit_items di ON di.id=dp.deposit_item_id WHERE di.lease_id=? AND dp.receipt_key IS NOT NULL",
        "SELECT receipt_key AS k FROM deposit_deductions WHERE lease_id=? AND receipt_key IS NOT NULL",
      ];
      for (const sql of queries) {
        const { results: keyRows } = await env.DB.prepare(sql).bind(lease.id).all<{ k: string | null }>();
        for (const row of keyRows ?? []) if (row.k) keys.add(row.k);
      }
      await env.DB.prepare("DELETE FROM agreements WHERE lease_id=?").bind(lease.id).run();
      await env.DB.prepare("DELETE FROM leases WHERE id=? AND status='ENDED'").bind(lease.id).run();
      for (const key of keys) {
        try { await env.FILES.delete(key); } catch { fileFailures += 1; }
      }
      if (!active) {
        // The account remains inactive; automatic retention never deletes the account itself.
        await env.DB.prepare("UPDATE users SET status='INACTIVE' WHERE id=? AND role='TENANT'").bind(lease.tenant_id).run();
      }
      cleaned += 1;
    }
    await env.DB.prepare(
      `INSERT INTO retention_settings (owner_id,retention_months,last_cleanup_at,last_records_cleaned,storage_cleanup_status,updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(owner_id) DO UPDATE SET last_cleanup_at=excluded.last_cleanup_at,
         last_records_cleaned=excluded.last_records_cleaned,storage_cleanup_status=excluded.storage_cleanup_status,
         updated_at=excluded.updated_at`,
    ).bind(owner.owner_id, owner.months, new Date().toISOString(), cleaned, fileFailures ? "PARTIAL" : "OK", new Date().toISOString()).run();
  }
}

export async function runScheduledMaintenance(env: Env): Promise<void> {
  await ensureCurrentRent(env);
  await env.DB.prepare(
    `UPDATE documents SET status='EXPIRED',updated_at=?
     WHERE archived_at IS NULL AND expiry_date IS NOT NULL AND expiry_date<date('now')
       AND status NOT IN ('COMPLETED','ARCHIVED','EXPIRED')`,
  ).bind(new Date().toISOString()).run();
  await sendRentNotifications(env);
  await sendUtilityNotifications(env);
  await cleanupEndedLeases(env);
}
