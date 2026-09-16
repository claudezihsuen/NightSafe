import type { Env, UserRow } from "../types";
import { getUserByEmail, getUserById } from "../db";
import { isAllowedBrowserOrigin } from "../cors";
import { verifyTotp } from "../account/totp";
import { hashPassword } from "./hash";
import { generateToken, hashToken } from "./session";

type RecoveryMethod = "EMAIL" | "PHONE" | "AUTHENTICATOR";

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function rejectCrossOriginBrowserMutation(request: Request, env: Env): Response | null {
  return isAllowedBrowserOrigin(request, env) ? null : json({ error: "Not authorized." }, 403);
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

async function resetRateKey(request: Request, email: string): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
  return hashToken(`password-reset:${ip}:${email.trim().toLowerCase()}`);
}

async function checkResetRateLimit(request: Request, env: Env, email: string): Promise<Response | null> {
  const key = await resetRateKey(request, email);
  const row = await env.DB.prepare(
    "SELECT attempts, window_started_at FROM login_rate_limits WHERE key_hash = ?",
  ).bind(key).first<{ attempts: number; window_started_at: string }>();
  const now = Date.now();
  const inWindow = row && now - new Date(row.window_started_at).getTime() < 15 * 60 * 1000;
  const attempts = inWindow ? row.attempts + 1 : 1;
  const startedAt = inWindow ? row.window_started_at : new Date(now).toISOString();
  await env.DB.prepare(
    `INSERT INTO login_rate_limits (key_hash, attempts, window_started_at, blocked_until, updated_at)
     VALUES (?, ?, ?, NULL, ?)
     ON CONFLICT(key_hash) DO UPDATE SET
       attempts = excluded.attempts,
       window_started_at = excluded.window_started_at,
       updated_at = excluded.updated_at`,
  ).bind(key, attempts, startedAt, new Date(now).toISOString()).run();
  if (attempts > 6) {
    return json({ error: "Too many password reset requests. Try again later." }, 429, { "Retry-After": "900" });
  }
  return null;
}

function userCanUseAuthenticator(user: UserRow): boolean {
  return Boolean(user.two_factor_secret && user.two_factor_enabled_at);
}

/** POST /api/auth/password-reset/request */
export async function requestPasswordReset(request: Request, env: Env): Promise<Response> {
  const originError = rejectCrossOriginBrowserMutation(request, env);
  if (originError) return originError;

  const body = await bodyOf(request);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const requestedMethod = typeof body.method === "string" ? body.method : "";
  if (!email) return json({ error: "Account email is required." }, 400);
  if (requestedMethod !== "AUTHENTICATOR") {
    return json({
      error: "Email and SMS password recovery are temporarily unavailable. Use your Authenticator App.",
    }, 503);
  }

  const limited = await checkResetRateLimit(request, env, email);
  if (limited) return limited;

  await env.DB.prepare("DELETE FROM password_reset_challenges WHERE expires_at < datetime('now') OR used_at IS NOT NULL").run();

  const user = await getUserByEmail(env, email);
  const fakeChallengeId = crypto.randomUUID();
  if (!user || user.status !== "ACTIVE" || !userCanUseAuthenticator(user)) {
    // Deliberately return the same shape so this endpoint does not reveal
    // whether this email address has an authenticator attached.
    return json({ ok: true, challengeId: fakeChallengeId, method: "AUTHENTICATOR" });
  }

  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO password_reset_challenges (id, user_id, method, code_hash, expires_at)
     VALUES (?, ?, 'AUTHENTICATOR', NULL, ?)`,
  ).bind(id, user.id, expiresAt).run();

  return json({ ok: true, challengeId: id, method: "AUTHENTICATOR" });
}

interface ResetChallengeRow {
  id: string;
  user_id: string;
  method: RecoveryMethod;
  code_hash: string | null;
  attempts: number;
  expires_at: string;
  verified_at: string | null;
  used_at: string | null;
}

/** POST /api/auth/password-reset/verify */
export async function verifyPasswordReset(request: Request, env: Env): Promise<Response> {
  const originError = rejectCrossOriginBrowserMutation(request, env);
  if (originError) return originError;

  const body = await bodyOf(request);
  const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!challengeId || !/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit authenticator code." }, 400);

  const challenge = await env.DB.prepare(
    `SELECT id, user_id, method, code_hash, attempts, expires_at, verified_at, used_at
     FROM password_reset_challenges WHERE id = ?`,
  ).bind(challengeId).first<ResetChallengeRow>();

  if (!challenge || challenge.used_at || new Date(challenge.expires_at).getTime() < Date.now()) {
    return json({ error: "This password reset request is invalid or has expired." }, 410);
  }
  if (challenge.method !== "AUTHENTICATOR") {
    await env.DB.prepare("DELETE FROM password_reset_challenges WHERE id = ?").bind(challengeId).run();
    return json({
      error: "Email and SMS password recovery are temporarily unavailable. Start again with your Authenticator App.",
    }, 410);
  }
  if (challenge.attempts >= 8) {
    await env.DB.prepare("DELETE FROM password_reset_challenges WHERE id = ?").bind(challengeId).run();
    return json({ error: "Too many incorrect attempts. Start again." }, 429);
  }

  const user = await getUserById(env, challenge.user_id);
  if (!user || user.status !== "ACTIVE") return json({ error: "This password reset request is invalid." }, 410);

  const valid = Boolean(
    user.two_factor_secret
      && user.two_factor_enabled_at
      && await verifyTotp(user.two_factor_secret, code),
  );

  if (!valid) {
    await env.DB.prepare("UPDATE password_reset_challenges SET attempts = attempts + 1 WHERE id = ?")
      .bind(challengeId).run();
    return json({ error: "Authenticator code is incorrect." }, 401);
  }

  const resetToken = generateToken();
  const resetTokenHash = await hashToken(resetToken);
  const resetExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `UPDATE password_reset_challenges
     SET verified_at = datetime('now'), reset_token_hash = ?, expires_at = ?
     WHERE id = ?`,
  ).bind(resetTokenHash, resetExpiresAt, challengeId).run();

  return json({ ok: true, resetToken });
}

/** POST /api/auth/password-reset/complete */
export async function completePasswordReset(request: Request, env: Env): Promise<Response> {
  const originError = rejectCrossOriginBrowserMutation(request, env);
  if (originError) return originError;

  const body = await bodyOf(request);
  const resetToken = typeof body.resetToken === "string" ? body.resetToken : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!resetToken || newPassword.length < 8) {
    return json({ error: "A valid reset token and a password of at least 8 characters are required." }, 400);
  }

  const tokenHash = await hashToken(resetToken);
  const challenge = await env.DB.prepare(
    `SELECT id, user_id, expires_at, verified_at, used_at
     FROM password_reset_challenges WHERE reset_token_hash = ?`,
  ).bind(tokenHash).first<{ id: string; user_id: string; expires_at: string; verified_at: string | null; used_at: string | null }>();

  if (!challenge || !challenge.verified_at || challenge.used_at || new Date(challenge.expires_at).getTime() < Date.now()) {
    return json({ error: "This password reset session is invalid or has expired." }, 410);
  }

  const passwordHash = await hashPassword(newPassword);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, challenge.user_id),
    env.DB.prepare("UPDATE password_reset_challenges SET used_at = datetime('now') WHERE id = ?").bind(challenge.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(challenge.user_id),
    env.DB.prepare("DELETE FROM two_factor_login_challenges WHERE user_id = ?").bind(challenge.user_id),
  ]);

  return json({ ok: true });
}
