import type { Env, SessionUser, UserRow } from "../types";
import { getUserById, toSessionUser } from "../db";
import { verifyPassword } from "../auth/hash";
import { hashToken, readSessionToken } from "../auth/session";
import { verifyTotp } from "./totp";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json().catch(() => null);
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function currentUser(env: Env, actor: SessionUser): Promise<UserRow | null> {
  return getUserById(env, actor.id);
}

async function currentTokenHash(request: Request): Promise<string | null> {
  const token = readSessionToken(request);
  return token ? hashToken(token) : null;
}

async function revokeOtherSessions(request: Request, env: Env, userId: string): Promise<void> {
  const tokenHash = await currentTokenHash(request);
  if (!tokenHash) {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
    return;
  }
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?")
    .bind(userId, tokenHash)
    .run();
}

async function requireCurrentPassword(user: UserRow, value: unknown): Promise<Response | null> {
  const password = typeof value === "string" ? value : "";
  if (!user.password_hash || !password || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: "Current password is incorrect." }, 401);
  }
  return null;
}

/**
 * Completes authenticator setup using an explicit secret assignment and then
 * reads the row back. This avoids the UI ever treating a setup as enabled
 * unless D1 actually persisted both the secret and enabled timestamp.
 */
export async function enableTwoFactorSafe(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response> {
  const user = await currentUser(env, actor);
  if (!user) return json({ error: "Account not found." }, 404);

  if (user.two_factor_enabled_at && user.two_factor_secret && !user.two_factor_pending_secret) {
    return json({ error: "Two-factor authentication is already enabled." }, 409);
  }

  const pendingSecret = user.two_factor_pending_secret;
  if (!pendingSecret) return json({ error: "Start two-factor setup first." }, 400);

  const body = await bodyOf(request);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!(await verifyTotp(pendingSecret, code))) {
    return json({ error: "Authenticator code is incorrect." }, 400);
  }

  await env.DB.prepare(
    `UPDATE users
     SET two_factor_secret = ?,
         two_factor_pending_secret = NULL,
         two_factor_enabled_at = datetime('now')
     WHERE id = ? AND two_factor_pending_secret = ?`,
  ).bind(pendingSecret, actor.id, pendingSecret).run();

  const updated = await getUserById(env, actor.id);
  if (!updated?.two_factor_secret || !updated.two_factor_enabled_at) {
    return json({ error: "Two-factor setup could not be saved. Please start setup again." }, 500);
  }

  await revokeOtherSessions(request, env, actor.id);
  return json({ user: await toSessionUser(env, updated) });
}

/**
 * Disables 2FA without getting stuck on a partially persisted state.
 * A valid current password is always required. If an active or pending TOTP
 * secret exists, the user must also prove possession with its current code.
 */
export async function disableTwoFactorSafe(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response> {
  const user = await currentUser(env, actor);
  if (!user) return json({ error: "Account not found." }, 404);

  const body = await bodyOf(request);
  const passwordError = await requireCurrentPassword(user, body.currentPassword);
  if (passwordError) return passwordError;

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const secrets = [user.two_factor_secret, user.two_factor_pending_secret]
    .filter((value): value is string => Boolean(value));
  const uniqueSecrets = [...new Set(secrets)];

  if (uniqueSecrets.length > 0) {
    if (!/^\d{6}$/.test(code)) {
      return json({ error: "Enter the 6-digit authenticator code." }, 400);
    }

    let verified = false;
    for (const secret of uniqueSecrets) {
      if (await verifyTotp(secret, code)) {
        verified = true;
        break;
      }
    }
    if (!verified) return json({ error: "Authenticator code is incorrect." }, 400);
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users
       SET two_factor_secret = NULL,
           two_factor_pending_secret = NULL,
           two_factor_enabled_at = NULL
       WHERE id = ?`,
    ).bind(actor.id),
    env.DB.prepare("DELETE FROM two_factor_login_challenges WHERE user_id = ?").bind(actor.id),
  ]);

  await revokeOtherSessions(request, env, actor.id);
  const updated = await getUserById(env, actor.id);
  return json({
    ok: true,
    alreadyDisabled: uniqueSecrets.length === 0,
    user: updated ? await toSessionUser(env, updated) : null,
  });
}
