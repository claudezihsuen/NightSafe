import type { Env, UserRow, SessionUser } from "./types";

export async function getUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  const row = await env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email.trim().toLowerCase())
    .first<UserRow>();
  return row ?? null;
}

export async function getUserById(env: Env, id: string): Promise<UserRow | null> {
  const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  return row ?? null;
}

export function toSessionUser(user: UserRow): SessionUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function createSession(env: Env, userId: string, tokenHash: string, expiresAt: string) {
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(tokenHash, userId, expiresAt)
    .run();
}

export async function deleteSession(env: Env, tokenHash: string) {
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

/** Returns the session's user if the token is valid and unexpired; deletes it if expired. */
export async function getSessionUser(env: Env, tokenHash: string): Promise<SessionUser | null> {
  const session = await env.DB.prepare(
    "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?",
  )
    .bind(tokenHash)
    .first<{ user_id: string; expires_at: string }>();

  if (!session) return null;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    await deleteSession(env, tokenHash);
    return null;
  }

  const user = await getUserById(env, session.user_id);
  if (!user || user.status !== "ACTIVE") return null;

  return toSessionUser(user);
}
