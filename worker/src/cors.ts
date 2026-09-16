import type { Env } from "./types";

function configuredFrontendOrigin(env: Env): string {
  try {
    return new URL(env.FRONTEND_URL).origin;
  } catch {
    return env.FRONTEND_URL.replace(/\/+$/, "");
  }
}

/**
 * Returns true for requests with no browser Origin header (for example curl
 * or Wrangler) and for requests coming from the configured frontend origin.
 */
export function isAllowedBrowserOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return !origin || origin === configuredFrontendOrigin(env);
}

export function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };

  // Only ever echo back the configured frontend origin — never "*",
  // since credentials: 'include' cookies require a specific origin.
  if (origin && origin === configuredFrontendOrigin(env)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}
