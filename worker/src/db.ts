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

export async function isPrimaryAdmin(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 AS present FROM primary_admins WHERE user_id = ?")
    .bind(userId)
    .first<{ present: number }>();
  return Boolean(row);
}

export async function toSessionUser(env: Env, user: UserRow): Promise<SessionUser> {
  const role = user.role === "ADMIN" && (await isPrimaryAdmin(env, user.id)) ? "SUPER_ADMIN" : user.role;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    nickname: user.nickname ?? null,
    language: user.language ?? "EN",
    phone: user.phone ?? null,
    emailVerified: Boolean(user.email_verified_at),
    phoneVerified: Boolean(user.phone_verified_at),
    twoFactorEnabled: Boolean(user.two_factor_enabled_at && user.two_factor_secret),
    role,
    unitId: user.unit_id,
  };
}

function deviceNameFromUserAgent(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent) && !/Edg\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const device = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(userAgent)
            ? "Mac"
            : /Linux/.test(userAgent)
              ? "Linux"
              : "Device";
  return `${browser} on ${device}`;
}

export async function createSession(
  env: Env,
  userId: string,
  tokenHash: string,
  expiresAt: string,
  request?: Request,
  rememberMe = false,
) {
  const userAgent = request?.headers.get("User-Agent")?.slice(0, 500) ?? "";
  const deviceName = deviceNameFromUserAgent(userAgent);
  const country = request?.headers.get("CF-IPCountry")?.slice(0, 8) ?? null;
  await env.DB.prepare(
    `INSERT INTO sessions
       (token_hash, user_id, expires_at, device_id, user_agent, device_name, country, last_seen_at, remember_me)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
  )
    .bind(tokenHash, userId, expiresAt, crypto.randomUUID(), userAgent || null, deviceName, country, rememberMe ? 1 : 0)
    .run();
}

export async function deleteSession(env: Env, tokenHash: string) {
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

/** Returns the session's user if the token is valid and unexpired; deletes it if expired. */
export async function getSessionUser(env: Env, tokenHash: string): Promise<SessionUser | null> {
  const session = await env.DB.prepare(
    "SELECT user_id, expires_at, last_seen_at FROM sessions WHERE token_hash = ?",
  )
    .bind(tokenHash)
    .first<{ user_id: string; expires_at: string; last_seen_at: string | null }>();

  if (!session) return null;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    await deleteSession(env, tokenHash);
    return null;
  }

  if (!session.last_seen_at || Date.now() - new Date(session.last_seen_at).getTime() > 5 * 60 * 1000) {
    await env.DB.prepare("UPDATE sessions SET last_seen_at = datetime('now') WHERE token_hash = ?")
      .bind(tokenHash)
      .run();
  }

  const user = await getUserById(env, session.user_id);
  if (!user || user.status !== "ACTIVE") return null;

  return toSessionUser(env, user);
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
    "SELECT * FROM properties WHERE owner_id = ? AND archived_at IS NULL ORDER BY name",
  )
    .bind(ownerId)
    .all<PropertyRow>();

  const units = await env.DB.prepare(
    `SELECT units.* FROM units
     JOIN properties ON properties.id = units.property_id
     WHERE properties.owner_id = ? AND units.archived_at IS NULL
     ORDER BY units.label`,
  )
    .bind(ownerId)
    .all<UnitRow>();

  return (properties.results ?? []).map((property) => ({
    ...property,
    units: (units.results ?? []).filter((unit) => unit.property_id === property.id),
  }));
}
