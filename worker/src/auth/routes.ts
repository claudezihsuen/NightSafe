import type { Env, Role, SessionUser } from "../types";
import { getUserByEmail, getUserById, createSession, deleteSession, toSessionUser } from "../db";
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

export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/** POST /api/auth/login */
export async function login(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return json({ error: "Email and password are required." }, 400);
  }

  const user = await getUserByEmail(env, email);

  // Same generic error whether the email doesn't exist, the account is
  // still pending activation, or the password is wrong — avoids leaking
  // which emails are registered.
  const genericError = () => json({ error: "Invalid email or password." }, 401);

  if (!user || user.status !== "ACTIVE" || !user.password_hash) {
    return genericError();
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return genericError();

  const token = generateToken();
  const tokenHash = await hashToken(token);
  await createSession(env, user.id, tokenHash, sessionExpiryIso());

  return json({ user: toSessionUser(user) }, 200, {
    "Set-Cookie": sessionCookieHeader(token, env),
  });
}

/** POST /api/auth/logout */
export async function logout(request: Request, env: Env): Promise<Response> {
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

/** GET /api/auth/invite/:token — check an invite is valid before showing the activation form. */
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

  return json({ name: user.name, email: user.email });
}

/**
 * POST /api/auth/activate — tenant sets their own password from the invite
 * link. This is the only place a tenant's password is ever created.
 */
export async function activate(request: Request, env: Env, token: string): Promise<Response> {
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

  const passwordHash = await hashPassword(password);

  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, status = 'ACTIVE' WHERE id = ?").bind(
      passwordHash,
      invite.user_id,
    ),
    env.DB.prepare("UPDATE invitations SET used_at = datetime('now') WHERE token_hash = ?").bind(
      tokenHash,
    ),
  ]);

  const user = await getUserById(env, invite.user_id);
  if (!user) return json({ error: "Something went wrong." }, 500);

  // Sign the tenant straight in.
  const sessionToken = generateToken();
  const sessionTokenHash = await hashToken(sessionToken);
  await createSession(env, user.id, sessionTokenHash, sessionExpiryIso());

  return json({ user: toSessionUser(user) }, 200, {
    "Set-Cookie": sessionCookieHeader(sessionToken, env),
  });
}

export type { Role };
