import type { Env, Role, SessionUser } from "../types";
import { getUserByEmail, getUserById, createSession, deleteSession, toSessionUser } from "../db";
import { isAllowedBrowserOrigin } from "../cors";
import { verifyTotp } from "../account/totp";
import { hashPassword, verifyPassword } from "./hash";
import {
  generateToken,
  hashToken,
  sessionCookieHeader,
  clearedSessionCookieHeader,
  readSessionToken,
  sessionExpiryIso,
} from "./session";

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function rejectCrossOriginBrowserMutation(request: Request, env: Env): Response | null {
  if (isAllowedBrowserOrigin(request, env)) return null;
  return json({ error: "Not authorized." }, 403);
}

export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 8;
const LOGIN_RATE_ROW_TTL_MS = 2 * 24 * 60 * 60 * 1000;
const TWO_FACTOR_CHALLENGE_MS = 5 * 60 * 1000;

interface LoginRateRow {
  attempts: number;
  window_started_at: string;
  blocked_until: string | null;
}

async function getLoginRateKey(request: Request, email: string): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
  return hashToken(`login:${ip}:${email.trim().toLowerCase()}`);
}

async function isLoginBlocked(env: Env, keyHash: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT attempts, window_started_at, blocked_until FROM login_rate_limits WHERE key_hash = ?",
  )
    .bind(keyHash)
    .first<LoginRateRow>();

  return Boolean(row?.blocked_until && new Date(row.blocked_until).getTime() > Date.now());
}

async function recordFailedLogin(env: Env, keyHash: string): Promise<void> {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const windowCutoffMs = nowMs - LOGIN_WINDOW_MS;
  const existing = await env.DB.prepare(
    "SELECT attempts, window_started_at, blocked_until FROM login_rate_limits WHERE key_hash = ?",
  )
    .bind(keyHash)
    .first<LoginRateRow>();

  const stillInWindow = existing && new Date(existing.window_started_at).getTime() >= windowCutoffMs;
  const attempts = stillInWindow ? existing.attempts + 1 : 1;
  const windowStartedAt = stillInWindow ? existing.window_started_at : now;
  const blockedUntil = attempts >= MAX_FAILED_LOGINS
    ? new Date(nowMs + LOGIN_BLOCK_MS).toISOString()
    : null;
  const staleBefore = new Date(nowMs - LOGIN_RATE_ROW_TTL_MS).toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO login_rate_limits (key_hash, attempts, window_started_at, blocked_until, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key_hash) DO UPDATE SET
         attempts = excluded.attempts,
         window_started_at = excluded.window_started_at,
         blocked_until = excluded.blocked_until,
         updated_at = excluded.updated_at`,
    ).bind(keyHash, attempts, windowStartedAt, blockedUntil, now),
    env.DB.prepare("DELETE FROM login_rate_limits WHERE updated_at < ?").bind(staleBefore),
  ]);
}

async function clearFailedLogins(env: Env, keyHash: string): Promise<void> {
  await env.DB.prepare("DELETE FROM login_rate_limits WHERE key_hash = ?").bind(keyHash).run();
}

/** POST /api/auth/login */
export async function login(request: Request, env: Env): Promise<Response> {
  const originError = rejectCrossOriginBrowserMutation(request, env);
  if (originError) return originError;

  const body = await request.json().catch(() => null) as {
    email?: unknown;
    password?: unknown;
    rememberMe?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const rememberMe = body?.rememberMe === true;

  if (!email || !password) {
    return json({ error: "Email and password are required." }, 400);
  }

  const rateKey = await getLoginRateKey(request, email);
  if (await isLoginBlocked(env, rateKey)) {
    return json(
      { error: "Too many failed login attempts. Try again later." },
      429,
      { "Retry-After": String(Math.ceil(LOGIN_BLOCK_MS / 1000)) },
    );
  }

  const user = await getUserByEmail(env, email);
  const genericError = async () => {
    await recordFailedLogin(env, rateKey);
    return json({ error: "Invalid email or password." }, 401);
  };

  if (!user || user.status !== "ACTIVE" || !user.password_hash) {
    return genericError();
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return genericError();

  await clearFailedLogins(env, rateKey);

  if (user.two_factor_enabled_at && user.two_factor_secret) {
    const challenge = generateToken();
    const challengeHash = await hashToken(challenge);
    const expiresAt = new Date(Date.now() + TWO_FACTOR_CHALLENGE_MS).toISOString();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM two_factor_login_challenges WHERE user_id = ? OR expires_at < datetime('now')").bind(user.id),
      env.DB.prepare(
        `INSERT INTO two_factor_login_challenges (token_hash, user_id, remember_me, expires_at)
         VALUES (?, ?, ?, ?)`,
      ).bind(challengeHash, user.id, rememberMe ? 1 : 0, expiresAt),
    ]);
    return json({ twoFactorRequired: true, challenge });
  }

  const token = generateToken();
  const tokenHash = await hashToken(token);
  await createSession(env, user.id, tokenHash, sessionExpiryIso(rememberMe), request, rememberMe);

  return json({ user: await toSessionUser(env, user) }, 200, {
    "Set-Cookie": sessionCookieHeader(token, env, rememberMe),
  });
}

/** POST /api/auth/2fa — completes a password-authenticated TOTP challenge. */
export async function verifyTwoFactorLogin(request: Request, env: Env): Promise<Response> {
  const originError = rejectCrossOriginBrowserMutation(request, env);
  if (originError) return originError;

  const body = await request.json().catch(() => null) as { challenge?: unknown; code?: unknown } | null;
  const challenge = typeof body?.challenge === "string" ? body.challenge : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!challenge || !/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit authenticator code." }, 400);

  const challengeHash = await hashToken(challenge);
  const row = await env.DB.prepare(
    "SELECT user_id, remember_me, attempts, expires_at FROM two_factor_login_challenges WHERE token_hash = ?",
  ).bind(challengeHash).first<{ user_id: string; remember_me: number; attempts: number; expires_at: string }>();

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    if (row) await env.DB.prepare("DELETE FROM two_factor_login_challenges WHERE token_hash = ?").bind(challengeHash).run();
    return json({ error: "This sign-in verification has expired. Sign in again." }, 410);
  }
  if (row.attempts >= 8) {
    await env.DB.prepare("DELETE FROM two_factor_login_challenges WHERE token_hash = ?").bind(challengeHash).run();
    return json({ error: "Too many incorrect authenticator codes. Sign in again." }, 429);
  }

  const user = await getUserById(env, row.user_id);
  if (!user || user.status !== "ACTIVE" || !user.two_factor_secret || !user.two_factor_enabled_at) {
    await env.DB.prepare("DELETE FROM two_factor_login_challenges WHERE token_hash = ?").bind(challengeHash).run();
    return json({ error: "This sign-in verification is no longer valid." }, 410);
  }

  if (!(await verifyTotp(user.two_factor_secret, code))) {
    await env.DB.prepare(
      "UPDATE two_factor_login_challenges SET attempts = attempts + 1 WHERE token_hash = ?",
    ).bind(challengeHash).run();
    return json({ error: "Authenticator code is incorrect." }, 401);
  }

  const rememberMe = row.remember_me === 1;
  const token = generateToken();
  const tokenHash = await hashToken(token);
  await env.DB.prepare("DELETE FROM two_factor_login_challenges WHERE token_hash = ?").bind(challengeHash).run();
  await createSession(env, user.id, tokenHash, sessionExpiryIso(rememberMe), request, rememberMe);

  return json({ user: await toSessionUser(env, user) }, 200, {
    "Set-Cookie": sessionCookieHeader(token, env, rememberMe),
  });
}

/** POST /api/auth/logout */
export async function logout(request: Request, env: Env): Promise<Response> {
  const originError = rejectCrossOriginBrowserMutation(request, env);
  if (originError) return originError;

  const token = readSessionToken(request);
  if (token) {
    await deleteSession(env, await hashToken(token));
  }
  return json({ ok: true }, 200, { "Set-Cookie": clearedSessionCookieHeader(env) });
}

/** GET /api/auth/me — resolves the current session, used for route protection. */
export async function me(sessionUser: SessionUser | null): Promise<Response> {
  if (!sessionUser) return json({ user: null }, 401);
  return json({ user: sessionUser });
}

/** GET /api/auth/invite/:token — validates an activation/password-reset link. */
export async function getInvite(env: Env, token: string): Promise<Response> {
  const tokenHash = await hashToken(token);
  const invite = await env.DB.prepare(
    "SELECT user_id, expires_at, used_at FROM invitations WHERE token_hash = ?",
  )
    .bind(tokenHash)
    .first<{ user_id: string; expires_at: string; used_at: string | null }>();

  if (!invite || invite.used_at || new Date(invite.expires_at).getTime() < Date.now()) {
    return json({ error: "This invitation link is invalid or has expired." }, 410);
  }

  const user = await getUserById(env, invite.user_id);
  if (!user) return json({ error: "This invitation link is invalid or has expired." }, 410);

  return json({
    name: user.name,
    email: user.email,
    purpose: user.status === "WAITING_FOR_ACTIVATION" ? "activation" : "reset",
  });
}

/**
 * POST /api/auth/activate/:token
 * Sets/replaces the account password. First-time invitations activate the
 * account. Password-reset links preserve the account's existing ACTIVE or
 * INACTIVE status so a disabled account cannot re-enable itself.
 */
export async function activate(request: Request, env: Env, token: string): Promise<Response> {
  const originError = rejectCrossOriginBrowserMutation(request, env);
  if (originError) return originError;

  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";

  if (password.length < 8) {
    return json({ error: "Password must be at least 8 characters." }, 400);
  }

  const tokenHash = await hashToken(token);
  const invite = await env.DB.prepare(
    "SELECT user_id, expires_at, used_at FROM invitations WHERE token_hash = ?",
  )
    .bind(tokenHash)
    .first<{ user_id: string; expires_at: string; used_at: string | null }>();

  if (!invite || invite.used_at || new Date(invite.expires_at).getTime() < Date.now()) {
    return json({ error: "This invitation link is invalid or has expired." }, 410);
  }

  const existingUser = await getUserById(env, invite.user_id);
  if (!existingUser) {
    return json({ error: "This invitation link is invalid or has expired." }, 410);
  }

  const passwordHash = await hashPassword(password);
  const nextStatus = existingUser.status === "WAITING_FOR_ACTIVATION" ? "ACTIVE" : existingUser.status;

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET password_hash = ?, status = ?, email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?",
    ).bind(passwordHash, nextStatus, invite.user_id),
    env.DB.prepare("UPDATE invitations SET used_at = datetime('now') WHERE token_hash = ?").bind(tokenHash),
  ]);

  const user = await getUserById(env, invite.user_id);
  if (!user) return json({ error: "Something went wrong." }, 500);

  if (user.status !== "ACTIVE") {
    return json(
      { user: await toSessionUser(env, user), signedIn: false },
      200,
      { "Set-Cookie": clearedSessionCookieHeader(env) },
    );
  }

  const sessionToken = generateToken();
  const sessionTokenHash = await hashToken(sessionToken);
  await createSession(env, user.id, sessionTokenHash, sessionExpiryIso(), request, false);

  return json({ user: await toSessionUser(env, user), signedIn: true }, 200, {
    "Set-Cookie": sessionCookieHeader(sessionToken, env, false),
  });
}

export type { Role };
