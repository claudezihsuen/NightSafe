import type { Env, Role, SessionUser } from "../types";
import { getSessionUser } from "../db";
import { readSessionToken } from "../auth/session";
import { hashToken } from "../auth/hash";

/** Resolves the current session user from the request cookie, or null. */
export async function resolveSession(request: Request, env: Env): Promise<SessionUser | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  return getSessionUser(env, await hashToken(token));
}

/**
 * Enforces that a request is authenticated, and optionally that the
 * session's role is one of `allowedRoles`. This is the server-side check
 * that route protection ultimately relies on — the frontend's route guard
 * is a UX convenience only, never the source of truth.
 */
export function requireRole(sessionUser: SessionUser | null, allowedRoles: Role[]): boolean {
  if (!sessionUser) return false;
  return allowedRoles.includes(sessionUser.role);
}
