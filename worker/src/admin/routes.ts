import type { Env, SessionUser } from "../types";
import { generateToken } from "../auth/session";
import { hashToken } from "../auth/hash";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

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
    "SELECT id, email, name, phone, role, status, created_at FROM users ORDER BY role, name",
  ).all<AdminUserRow>();

  return json({ users: results ?? [] });
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
