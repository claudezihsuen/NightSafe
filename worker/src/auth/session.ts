import type { Env } from "../types";

const SESSION_COOKIE = "ns_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Random opaque token sent to the browser as a cookie. Never stored raw. */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes.buffer as ArrayBuffer);
}

/** SHA-256 of a token — this is what we persist in D1. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(digest);
}

interface CookieOptions {
  maxAgeSeconds?: number; // omit (or 0) to expire the cookie immediately
  secure: boolean;
}

function buildCookie(value: string, { maxAgeSeconds, secure }: CookieOptions): string {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds ?? 0}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function sessionCookieHeader(token: string, env: Env): string {
  const secure = env.ENVIRONMENT !== "development";
  return buildCookie(token, { maxAgeSeconds: SESSION_TTL_SECONDS, secure });
}

export function clearedSessionCookieHeader(env: Env): string {
  const secure = env.ENVIRONMENT !== "development";
  return buildCookie("", { maxAgeSeconds: 0, secure });
}

export function readSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}

export function sessionExpiryIso(): string {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
}
