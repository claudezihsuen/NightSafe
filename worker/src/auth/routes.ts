import type { Env, Role, SessionUser } from "../types";
import { getUserByEmail, getUserById, createSession, deleteSession, toSessionUser } from "../db";
import { isAllowedBrowserOrigin } from "../cors";
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

/** POST /api/auth/login */
export async function login(request: Request, env: Env): Promise<Response> {
  const originError = rejectCrossOriginBrowserMutation(request, env);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return json({ error: "Email and password are required." }, 400);
  }

  const user = await getUserByEmail(env, email);
  const genericError = () => json({ error: "Invalid email or password." }, 401);

  if (!user || user.status !== "ACTIVE" || !user.password_hash) {
    return genericError();
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return genericError();

  const token = generateToken();
  const tokenHash = await hashToken(token);
  await createSession(env, user.id, tokenHash, sessionExpiryIso());

  return json({ user: await toSessionUser(env, user) }, 200, {
    "Set-Cookie": sessionCookieHeader(token, env),
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

  const body = await request.json().catch(() => null);
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
    env.DB.prepare("UPDATE users SET password_hash = ?, status = ? WHERE id = ?").bind(
      passwordHash,
      nextStatus,
      invite.user_id,
    ),
    env.DB.prepare("UPDATE invitations SET used_at = datetime('now') WHERE token_hash = ?").bind(
      tokenHash,
    ),
  ]);

  const user = await getUserById(env, invite.user_id);
  if (!user) return json({ error: "Something went wrong." }, 500);

  // Disabled accounts may reset their password, but they remain disabled and
  // are not given a usable session until an admin enables them again.
  if (user.status !== "ACTIVE") {
    return json(
      { user: await toSessionUser(env, user), signedIn: false },
      200,
      { "Set-Cookie": clearedSessionCookieHeader(env) },
    );
  }

  const sessionToken = generateToken();
  const sessionTokenHash = await hashToken(sessionToken);
  await createSession(env, user.id, sessionTokenHash, sessionExpiryIso());

  return json({ user: await toSessionUser(env, user), signedIn: true }, 200, {
    "Set-Cookie": sessionCookieHeader(sessionToken, env),
  });
}

export type { Role };
