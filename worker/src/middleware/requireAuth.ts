import type { Env, Role, SessionUser } from "../types";
import { getSessionUser } from "../db";
import { readSessionToken } from "../auth/session";
import { hashToken } from "../auth/hash";
import { isAllowedBrowserOrigin } from "../cors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Resolves the current session user from the request cookie, or null. */
export async function resolveSession(request: Request, env: Env): Promise<SessionUser | null> {
  // Production uses SameSite=None because the Pages frontend and Workers API
  // are currently on different sites. Reject authenticated browser mutations
  // from any other Origin so the cross-site cookie cannot be used for CSRF.
  if (!SAFE_METHODS.has(request.method.toUpperCase()) && !isAllowedBrowserOrigin(request, env)) {
    return null;
  }

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
