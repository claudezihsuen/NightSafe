import type { Env, UserRow, SessionUser, PropertyRow, UnitRow } from "./types";

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
  return { id: user.id, email: user.email, name: user.name, role: user.role, unitId: user.unit_id };
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

export async function getPropertyById(env: Env, id: string): Promise<PropertyRow | null> {
  const row = await env.DB.prepare("SELECT * FROM properties WHERE id = ?").bind(id).first<PropertyRow>();
  return row ?? null;
}

export async function getUnitById(env: Env, id: string): Promise<UnitRow | null> {
  const row = await env.DB.prepare("SELECT * FROM units WHERE id = ?").bind(id).first<UnitRow>();
  return row ?? null;
}

/** Properties owned by this Owner, each with its units — for the tenant-creation picker. */
export async function listOwnerPropertiesWithUnits(env: Env, ownerId: string) {
  const properties = await env.DB.prepare(
    "SELECT * FROM properties WHERE owner_id = ? ORDER BY name",
  )
    .bind(ownerId)
    .all<PropertyRow>();

  const units = await env.DB.prepare(
    `SELECT units.* FROM units
     JOIN properties ON properties.id = units.property_id
     WHERE properties.owner_id = ?
     ORDER BY units.label`,
  )
    .bind(ownerId)
    .all<UnitRow>();

  return (properties.results ?? []).map((property) => ({
    ...property,
    units: (units.results ?? []).filter((unit) => unit.property_id === property.id),
  }));
}
