import type { Env, UserRow } from "../types";
import { getUserByEmail, getUserById } from "../db";
import { isAllowedBrowserOrigin } from "../cors";
import { sendVerificationEmail } from "../account/email";
import { sendRecoverySms } from "../account/sms";
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

function verificationCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

function methodOf(value: unknown): RecoveryMethod | null {
  return value === "EMAIL" || value === "PHONE" || value === "AUTHENTICATOR" ? value : null;
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

function methodIsConfigured(env: Env, method: RecoveryMethod): boolean {
  if (method === "EMAIL") return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  if (method === "PHONE") return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
  return true;
}

function userCanUse(user: UserRow, method: RecoveryMethod): boolean {
  if (method === "EMAIL") return Boolean(user.email_verified_at);
  if (method === "PHONE") return Boolean(user.phone && user.phone_verified_at);
  return Boolean(user.two_factor_secret && user.two_factor_enabled_at);
}

/** POST /api/auth/password-reset/request */
export async function requestPasswordReset(request: Request, env: Env): Promise<Response> {
  const originError = rejectCrossOriginBrowserMutation(request, env);
  if (originError) return originError;

  const body = await bodyOf(request);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const method = methodOf(body.method);
  if (!email || !method) return json({ error: "Email and recovery method are required." }, 400);

  if (!methodIsConfigured(env, method)) {
    return json({
      error: method === "PHONE"
        ? "SMS password recovery is not configured yet."
        : "Email password recovery is not configured yet.",
    }, 503);
  }

  const limited = await checkResetRateLimit(request, env, email);
  if (limited) return limited;

  await env.DB.prepare("DELETE FROM password_reset_challenges WHERE expires_at < datetime('now') OR used_at IS NOT NULL").run();

  const user = await getUserByEmail(env, email);
  const fakeChallengeId = crypto.randomUUID();
  if (!user || user.status !== "ACTIVE" || !userCanUse(user, method)) {
    // Deliberately return the same shape so this endpoint does not reveal
    // whether an email address, phone number, or authenticator is registered.
    return json({ ok: true, challengeId: fakeChallengeId, method });
  }

  const id = crypto.randomUUID();
  const code = method === "AUTHENTICATOR" ? null : verificationCode();
  const codeHash = code ? await hashToken(code) : null;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO password_reset_challenges (id, user_id, method, code_hash, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, user.id, method, codeHash, expiresAt).run();

  let delivered = true;
  if (method === "EMAIL" && code) {
    delivered = await sendVerificationEmail(env, user.email, code, "EMAIL_CHANGE");
  } else if (method === "PHONE" && code && user.phone) {
    delivered = await sendRecoverySms(env, user.phone, code);
  }

  if (!delivered) {
    await env.DB.prepare("DELETE FROM password_reset_challenges WHERE id = ?").bind(id).run();
    return json({ error: "The verification code could not be delivered. Try again later." }, 503);
  }

  return json({ ok: true, challengeId: id, method });
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
  if (!challengeId || !/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit verification code." }, 400);

  const challenge = await env.DB.prepare(
    `SELECT id, user_id, method, code_hash, attempts, expires_at, verified_at, used_at
     FROM password_reset_challenges WHERE id = ?`,
  ).bind(challengeId).first<ResetChallengeRow>();

  if (!challenge || challenge.used_at || new Date(challenge.expires_at).getTime() < Date.now()) {
    return json({ error: "This password reset request is invalid or has expired." }, 410);
  }
  if (challenge.attempts >= 8) {
    await env.DB.prepare("DELETE FROM password_reset_challenges WHERE id = ?").bind(challengeId).run();
    return json({ error: "Too many incorrect attempts. Start again." }, 429);
  }

  const user = await getUserById(env, challenge.user_id);
  if (!user || user.status !== "ACTIVE") return json({ error: "This password reset request is invalid." }, 410);

  let valid = false;
  if (challenge.method === "AUTHENTICATOR") {
    valid = Boolean(user.two_factor_secret && user.two_factor_enabled_at && await verifyTotp(user.two_factor_secret, code));
  } else if (challenge.code_hash) {
    valid = (await hashToken(code)) === challenge.code_hash;
  }

  if (!valid) {
    await env.DB.prepare("UPDATE password_reset_challenges SET attempts = attempts + 1 WHERE id = ?")
      .bind(challengeId).run();
    return json({ error: "Verification code is incorrect." }, 401);
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
