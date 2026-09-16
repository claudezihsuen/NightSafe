import type { Env, Language, SessionUser, UserRow } from "../types";
import { getUserById, toSessionUser } from "../db";
import { hashPassword, verifyPassword } from "../auth/hash";
import { generateToken, hashToken, readSessionToken } from "../auth/session";
import { generateTotpSecret, totpUri, verifyTotp } from "./totp";
import { maskEmail, sendVerificationEmail } from "./email";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isLanguage(value: unknown): value is Language {
  return value === "EN" || value === "ZH" || value === "TA";
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function normalizePhone(value: string): string | null {
  const compact = value.replace(/[\s()-]/g, "");
  if (!/^\+?[0-9]{8,15}$/.test(compact)) return null;
  return compact.startsWith("+") ? compact : `+${compact}`;
}

function verificationCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json().catch(() => null);
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function currentUser(env: Env, actor: SessionUser): Promise<UserRow | null> {
  return getUserById(env, actor.id);
}

async function requirePassword(user: UserRow, value: unknown): Promise<Response | null> {
  const password = typeof value === "string" ? value : "";
  if (!user.password_hash || !password || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: "Current password is incorrect." }, 401);
  }
  return null;
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

async function updateLanguage(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const body = await bodyOf(request);
  if (!isLanguage(body.language)) return json({ error: "Unsupported language." }, 400);
  await env.DB.prepare("UPDATE users SET language = ? WHERE id = ?").bind(body.language, actor.id).run();
  const user = await getUserById(env, actor.id);
  return json({ user: user ? await toSessionUser(env, user) : null });
}

async function updateNickname(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const body = await bodyOf(request);
  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
  if (nickname.length < 2 || nickname.length > 32) {
    return json({ error: "Nickname must be between 2 and 32 characters." }, 400);
  }
  const duplicate = await env.DB.prepare(
    "SELECT id FROM users WHERE lower(nickname) = lower(?) AND id != ? LIMIT 1",
  ).bind(nickname, actor.id).first<{ id: string }>();
  if (duplicate) return json({ error: "That nickname is already in use." }, 409);
  try {
    await env.DB.prepare("UPDATE users SET nickname = ? WHERE id = ?").bind(nickname, actor.id).run();
  } catch {
    return json({ error: "That nickname is already in use." }, 409);
  }
  const user = await getUserById(env, actor.id);
  return json({ user: user ? await toSessionUser(env, user) : null });
}

async function changePassword(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const user = await currentUser(env, actor);
  if (!user) return json({ error: "Account not found." }, 404);
  const body = await bodyOf(request);
  const passwordError = await requirePassword(user, body.currentPassword);
  if (passwordError) return passwordError;
  const nextPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (nextPassword.length < 8) return json({ error: "New password must be at least 8 characters." }, 400);
  if (await verifyPassword(nextPassword, user.password_hash!)) {
    return json({ error: "Choose a password different from your current password." }, 400);
  }
  const passwordHash = await hashPassword(nextPassword);
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, actor.id).run();
  await revokeOtherSessions(request, env, actor.id);
  return json({ ok: true });
}

async function createVerification(
  env: Env,
  userId: string,
  purpose: "EMAIL_CHANGE" | "PHONE_CHANGE",
  targetValue: string,
): Promise<{ id: string; code: string }> {
  const id = crypto.randomUUID();
  const code = verificationCode();
  const codeHash = await hashToken(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM account_verifications WHERE user_id = ? AND purpose = ?").bind(userId, purpose),
    env.DB.prepare(
      `INSERT INTO account_verifications (id, user_id, purpose, target_value, code_hash, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, userId, purpose, targetValue, codeHash, expiresAt),
  ]);
  return { id, code };
}

async function requestEmailChange(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const user = await currentUser(env, actor);
  if (!user) return json({ error: "Account not found." }, 404);
  const body = await bodyOf(request);
  const passwordError = await requirePassword(user, body.currentPassword);
  if (passwordError) return passwordError;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!validEmail(email)) return json({ error: "Enter a valid email address." }, 400);
  if (email === user.email.toLowerCase()) return json({ error: "This is already your current email." }, 400);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1")
    .bind(email, actor.id).first<{ id: string }>();
  if (existing) return json({ error: "That email is already used by another account." }, 409);

  const challenge = await createVerification(env, actor.id, "EMAIL_CHANGE", email);
  const delivered = await sendVerificationEmail(env, email, challenge.code, "EMAIL_CHANGE");
  if (!delivered) {
    await env.DB.prepare("DELETE FROM account_verifications WHERE id = ?").bind(challenge.id).run();
    return json({ error: "Email verification delivery is not configured yet. Ask the NightSafe administrator to configure transactional email." }, 503);
  }
  return json({ ok: true, challengeId: challenge.id, sentTo: maskEmail(email) });
}

interface VerificationRow {
  id: string;
  target_value: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
}

async function consumeVerification(
  env: Env,
  userId: string,
  purpose: "EMAIL_CHANGE" | "PHONE_CHANGE",
  challengeId: unknown,
  codeValue: unknown,
): Promise<{ target: string } | Response> {
  const id = typeof challengeId === "string" ? challengeId : "";
  const code = typeof codeValue === "string" ? codeValue.trim() : "";
  if (!id || !/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit verification code." }, 400);
  const row = await env.DB.prepare(
    `SELECT id, target_value, code_hash, attempts, expires_at
     FROM account_verifications WHERE id = ? AND user_id = ? AND purpose = ?`,
  ).bind(id, userId, purpose).first<VerificationRow>();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    if (row) await env.DB.prepare("DELETE FROM account_verifications WHERE id = ?").bind(row.id).run();
    return json({ error: "This verification code has expired. Request a new one." }, 410);
  }
  if (row.attempts >= 6) {
    await env.DB.prepare("DELETE FROM account_verifications WHERE id = ?").bind(row.id).run();
    return json({ error: "Too many incorrect attempts. Request a new code." }, 429);
  }
  if ((await hashToken(code)) !== row.code_hash) {
    await env.DB.prepare("UPDATE account_verifications SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    return json({ error: "Verification code is incorrect." }, 400);
  }
  await env.DB.prepare("DELETE FROM account_verifications WHERE id = ?").bind(row.id).run();
  return { target: row.target_value };
}

async function confirmEmailChange(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const body = await bodyOf(request);
  const result = await consumeVerification(env, actor.id, "EMAIL_CHANGE", body.challengeId, body.code);
  if (result instanceof Response) return result;
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1")
    .bind(result.target, actor.id).first<{ id: string }>();
  if (existing) return json({ error: "That email is already used by another account." }, 409);
  await env.DB.prepare("UPDATE users SET email = ?, email_verified_at = datetime('now') WHERE id = ?")
    .bind(result.target, actor.id).run();
  await revokeOtherSessions(request, env, actor.id);
  const user = await getUserById(env, actor.id);
  return json({ user: user ? await toSessionUser(env, user) : null });
}

async function requestPhoneChange(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const user = await currentUser(env, actor);
  if (!user) return json({ error: "Account not found." }, 404);
  const body = await bodyOf(request);
  const passwordError = await requirePassword(user, body.currentPassword);
  if (passwordError) return passwordError;
  if (!user.email_verified_at) return json({ error: "Verify your email before changing your phone number." }, 400);
  const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
  if (!phone) return json({ error: "Enter a valid phone number, including country code." }, 400);
  const challenge = await createVerification(env, actor.id, "PHONE_CHANGE", phone);
  const delivered = await sendVerificationEmail(env, user.email, challenge.code, "PHONE_CHANGE");
  if (!delivered) {
    await env.DB.prepare("DELETE FROM account_verifications WHERE id = ?").bind(challenge.id).run();
    return json({ error: "Email verification delivery is not configured yet. Ask the NightSafe administrator to configure transactional email." }, 503);
  }
  return json({ ok: true, challengeId: challenge.id, sentTo: maskEmail(user.email) });
}

async function confirmPhoneChange(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const body = await bodyOf(request);
  const result = await consumeVerification(env, actor.id, "PHONE_CHANGE", body.challengeId, body.code);
  if (result instanceof Response) return result;
  await env.DB.prepare("UPDATE users SET phone = ?, phone_verified_at = datetime('now') WHERE id = ?")
    .bind(result.target, actor.id).run();
  const user = await getUserById(env, actor.id);
  return json({ user: user ? await toSessionUser(env, user) : null });
}

async function startTwoFactor(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const user = await currentUser(env, actor);
  if (!user) return json({ error: "Account not found." }, 404);
  const body = await bodyOf(request);
  const passwordError = await requirePassword(user, body.currentPassword);
  if (passwordError) return passwordError;
  if (user.two_factor_enabled_at && user.two_factor_secret) return json({ error: "Two-factor authentication is already enabled." }, 409);
  const secret = generateTotpSecret();
  await env.DB.prepare("UPDATE users SET two_factor_pending_secret = ? WHERE id = ?")
    .bind(secret, actor.id).run();
  return json({ secret, uri: totpUri(secret, user.email) });
}

async function enableTwoFactor(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const user = await currentUser(env, actor);
  if (!user?.two_factor_pending_secret) return json({ error: "Start two-factor setup first." }, 400);
  const body = await bodyOf(request);
  const code = typeof body.code === "string" ? body.code : "";
  if (!(await verifyTotp(user.two_factor_pending_secret, code))) {
    return json({ error: "Authenticator code is incorrect." }, 400);
  }
  await env.DB.prepare(
    `UPDATE users
     SET two_factor_secret = two_factor_pending_secret,
         two_factor_pending_secret = NULL,
         two_factor_enabled_at = datetime('now')
     WHERE id = ?`,
  ).bind(actor.id).run();
  await revokeOtherSessions(request, env, actor.id);
  const updated = await getUserById(env, actor.id);
  return json({ user: updated ? await toSessionUser(env, updated) : null });
}

async function disableTwoFactor(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const user = await currentUser(env, actor);
  if (!user) return json({ error: "Account not found." }, 404);
  if (!user.two_factor_enabled_at || !user.two_factor_secret) return json({ error: "Two-factor authentication is not enabled." }, 400);
  const body = await bodyOf(request);
  const passwordError = await requirePassword(user, body.currentPassword);
  if (passwordError) return passwordError;
  const code = typeof body.code === "string" ? body.code : "";
  if (!(await verifyTotp(user.two_factor_secret, code))) return json({ error: "Authenticator code is incorrect." }, 400);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users
       SET two_factor_secret = NULL, two_factor_pending_secret = NULL, two_factor_enabled_at = NULL
       WHERE id = ?`,
    ).bind(actor.id),
    env.DB.prepare("DELETE FROM two_factor_login_challenges WHERE user_id = ?").bind(actor.id),
  ]);
  return json({ ok: true });
}

interface DeviceRow {
  token_hash: string;
  device_id: string | null;
  device_name: string | null;
  user_agent: string | null;
  country: string | null;
  last_seen_at: string | null;
  created_at: string;
  expires_at: string;
}

async function listDevices(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  const tokenHash = await currentTokenHash(request);
  const rows = await env.DB.prepare(
    `SELECT token_hash, device_id, device_name, user_agent, country, last_seen_at, created_at, expires_at
     FROM sessions
     WHERE user_id = ? AND expires_at > datetime('now')
     ORDER BY COALESCE(last_seen_at, created_at) DESC`,
  ).bind(actor.id).all<DeviceRow>();
  return json({
    devices: (rows.results ?? []).map((row) => ({
      id: row.device_id ?? row.token_hash.slice(0, 12),
      name: row.device_name ?? "Existing session",
      userAgent: row.user_agent,
      country: row.country,
      lastSeenAt: row.last_seen_at ?? row.created_at,
      createdAt: row.created_at,
      current: Boolean(tokenHash && row.token_hash === tokenHash),
    })),
  });
}

async function revokeDevice(request: Request, env: Env, actor: SessionUser, deviceId: string): Promise<Response> {
  const current = await currentTokenHash(request);
  const row = await env.DB.prepare("SELECT token_hash FROM sessions WHERE user_id = ? AND device_id = ?")
    .bind(actor.id, deviceId).first<{ token_hash: string }>();
  if (!row) return json({ error: "Device session not found." }, 404);
  if (current && row.token_hash === current) return json({ error: "You cannot sign out the device you are currently using." }, 400);
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND device_id = ?").bind(actor.id, deviceId).run();
  return json({ ok: true });
}

const DEVICE_ROUTE = /^\/api\/account\/devices\/([^/]+)$/;

export async function handleAccountRoute(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const method = request.method;

  if (path === "/api/account/language" && method === "PATCH") return updateLanguage(request, env, actor);
  if (path === "/api/account/nickname" && method === "PATCH") return updateNickname(request, env, actor);
  if (path === "/api/account/password" && method === "POST") return changePassword(request, env, actor);
  if (path === "/api/account/email/request" && method === "POST") return requestEmailChange(request, env, actor);
  if (path === "/api/account/email/confirm" && method === "POST") return confirmEmailChange(request, env, actor);
  if (path === "/api/account/phone/request" && method === "POST") return requestPhoneChange(request, env, actor);
  if (path === "/api/account/phone/confirm" && method === "POST") return confirmPhoneChange(request, env, actor);
  if (path === "/api/account/two-factor/setup" && method === "POST") return startTwoFactor(request, env, actor);
  if (path === "/api/account/two-factor/enable" && method === "POST") return enableTwoFactor(request, env, actor);
  if (path === "/api/account/two-factor" && method === "DELETE") return disableTwoFactor(request, env, actor);
  if (path === "/api/account/devices" && method === "GET") return listDevices(request, env, actor);
  if (DEVICE_ROUTE.test(path) && method === "DELETE") {
    const [, deviceId] = path.match(DEVICE_ROUTE)!;
    return revokeDevice(request, env, actor, decodeURIComponent(deviceId));
  }
  return null;
}
