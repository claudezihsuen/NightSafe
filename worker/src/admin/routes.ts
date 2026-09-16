import type { Env, SessionUser } from "../types";
import { generateToken } from "../auth/session";
import { hashToken } from "../auth/hash";
import { isPrimaryAdmin } from "../db";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour
const ADMIN_INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  status: "ACTIVE" | "WAITING_FOR_ACTIVATION" | "INACTIVE";
  created_at: string;
}

/** GET /api/admin/users — every account in the system. Never includes password_hash. */
export async function listUsers(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT
       u.id,
       u.email,
       u.name,
       u.phone,
       CASE WHEN pa.user_id IS NOT NULL THEN 'SUPER_ADMIN' ELSE u.role END AS role,
       u.status,
       u.created_at
     FROM users u
     LEFT JOIN primary_admins pa ON pa.user_id = u.id
     ORDER BY role, u.name`,
  ).all<AdminUserRow>();

  return json({ users: results ?? [] });
}

/** POST /api/admin/admins — SUPER_ADMIN only. Creates a normal ADMIN invite. */
export async function createAdminAccount(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response> {
  if (actor.role !== "SUPER_ADMIN") {
    return json({ error: "Only the primary administrator can create admin accounts." }, 403);
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body?.phone === "string" && body.phone.trim() ? body.phone.trim() : null;

  if (!name || !email) {
    return json({ error: "Name and email are required." }, 400);
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE")
    .bind(email)
    .first<{ id: string }>();
  if (existing) {
    return json({ error: "An account with this email already exists." }, 409);
  }

  const id = crypto.randomUUID();
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + ADMIN_INVITE_TTL_MS).toISOString();
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, email, name, phone, role, status, created_by)
       VALUES (?, ?, ?, ?, 'ADMIN', 'WAITING_FOR_ACTIVATION', ?)`,
    ).bind(id, email, name, phone, actor.id),
    env.DB.prepare("INSERT INTO invitations (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(
      tokenHash,
      id,
      expiresAt,
    ),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'ADMIN_ACCOUNT_CREATED', 'user', ?, ?)`,
    ).bind(auditLogId, actor.id, id, JSON.stringify({ email })),
  ]);

  const frontendUrl = env.FRONTEND_URL.replace(/\/+$/, "");
  return json(
    {
      user: {
        id,
        email,
        name,
        phone,
        role: "ADMIN",
        status: "WAITING_FOR_ACTIVATION",
      },
      activationLink: `${frontendUrl}/invite/${token}`,
      expiresAt,
    },
    201,
  );
}

/** POST /api/admin/users/:id/reset-password */
export async function initiatePasswordReset(
  env: Env,
  actor: SessionUser,
  targetUserId: string,
): Promise<Response> {
  const target = await env.DB.prepare("SELECT id, name, status FROM users WHERE id = ?")
    .bind(targetUserId)
    .first<{ id: string; name: string; status: string }>();
  if (!target) return json({ error: "Account not found." }, 404);

  const targetIsPrimaryAdmin = await isPrimaryAdmin(env, targetUserId);
  if (targetIsPrimaryAdmin && actor.role !== "SUPER_ADMIN") {
    return json({ error: "The primary administrator account can only be managed by itself." }, 403);
  }
  if (target.status === "WAITING_FOR_ACTIVATION") {
    return json({ error: "This account already has an activation link." }, 409);
  }

  const token = generateToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    // Only the newest reset link should remain usable.
    env.DB.prepare(
      "UPDATE invitations SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
    ).bind(targetUserId),
    env.DB.prepare("INSERT INTO invitations (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(
      tokenHash,
      targetUserId,
      expiresAt,
    ),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id)
       VALUES (?, ?, 'ADMIN_PASSWORD_RESET_INITIATED', 'user', ?)`,
    ).bind(auditLogId, actor.id, targetUserId),
  ]);

  const frontendUrl = env.FRONTEND_URL.replace(/\/+$/, "");
  return json({
    resetLink: `${frontendUrl}/invite/${token}`,
    expiresAt,
  });
}

/** PATCH /api/admin/users/:id/status — body: { status: "ACTIVE" | "INACTIVE" } */
export async function setUserStatus(
  request: Request,
  env: Env,
  actor: SessionUser,
  targetUserId: string,
): Promise<Response> {
  if (targetUserId === actor.id) {
    return json({ error: "You can't change your own account status." }, 400);
  }

  const body = await request.json().catch(() => null);
  const status = body?.status;
  if (status !== "ACTIVE" && status !== "INACTIVE") {
    return json({ error: "status must be ACTIVE or INACTIVE." }, 400);
  }

  const target = await env.DB.prepare("SELECT id, status FROM users WHERE id = ?")
    .bind(targetUserId)
    .first<{ id: string; status: string }>();
  if (!target) return json({ error: "Account not found." }, 404);
  if (await isPrimaryAdmin(env, targetUserId)) {
    return json({ error: "The primary administrator account cannot be disabled here." }, 403);
  }
  if (target.status === "WAITING_FOR_ACTIVATION") {
    return json({ error: "This account hasn't been activated yet." }, 409);
  }

  const auditLogId = crypto.randomUUID();
  const statements = [
    env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(status, targetUserId),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id)
       VALUES (?, ?, ?, 'user', ?)`,
    ).bind(
      auditLogId,
      actor.id,
      status === "ACTIVE" ? "ADMIN_ACCOUNT_ENABLED" : "ADMIN_ACCOUNT_DISABLED",
      targetUserId,
    ),
  ];

  if (status === "INACTIVE") {
    statements.push(env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetUserId));
  }

  await env.DB.batch(statements);
  return json({ ok: true });
}
