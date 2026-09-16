import type { Env } from "../types";

const SESSION_COOKIE = "ns_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // server-side validity for normal sessions
const REMEMBERED_SESSION_TTL_SECONDS = 60 * 60 * 24 * 365; // remembered trusted device

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
  maxAgeSeconds?: number;
  secure: boolean;
  sameSite: "Lax";
}

function buildCookie(value: string, { maxAgeSeconds, secure, sameSite }: CookieOptions): string {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite}`,
  ];
  if (maxAgeSeconds !== undefined) parts.push(`Max-Age=${maxAgeSeconds}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function cookieOptions(env: Env): Pick<CookieOptions, "secure" | "sameSite"> {
  return { secure: env.ENVIRONMENT !== "development", sameSite: "Lax" };
}

/**
 * Without Remember me the cookie is a browser-session cookie. With Remember me
 * it persists on this device for up to a year. NightSafe never stores the raw
 * password in localStorage or any JS-readable browser storage.
 */
export function sessionCookieHeader(token: string, env: Env, rememberMe = false): string {
  return buildCookie(token, {
    maxAgeSeconds: rememberMe ? REMEMBERED_SESSION_TTL_SECONDS : undefined,
    ...cookieOptions(env),
  });
}

export function clearedSessionCookieHeader(env: Env): string {
  return buildCookie("", { maxAgeSeconds: 0, ...cookieOptions(env) });
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

export function sessionExpiryIso(rememberMe = false): string {
  const ttl = rememberMe ? REMEMBERED_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS;
  return new Date(Date.now() + ttl * 1000).toISOString();
}
