import type { Env } from "./types";
import { corsHeaders, withCors } from "./cors";
import { resolveSession, requireRole } from "./middleware/requireAuth";
import { login, logout, me, inviteTenant, getInvite, activate } from "./auth/routes";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    let response: Response;

    try {
      if (pathname === "/api/auth/login" && method === "POST") {
        response = await login(request, env);
      } else if (pathname === "/api/auth/logout" && method === "POST") {
        response = await logout(request, env);
      } else if (pathname === "/api/auth/me" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        response = await me(sessionUser);
      } else if (pathname === "/api/auth/invite" && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER", "AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await inviteTenant(request, env, sessionUser!);
        }
      } else if (pathname.startsWith("/api/auth/invite/") && method === "GET") {
        const token = pathname.split("/").pop()!;
        response = await getInvite(env, token);
      } else if (pathname.startsWith("/api/auth/activate/") && method === "POST") {
        const token = pathname.split("/").pop()!;
        response = await activate(request, env, token);
      } else {
        response = json({ error: "Not found." }, 404);
      }
    } catch (err) {
      console.error(err);
      response = json({ error: "Internal server error." }, 500);
    }

    return withCors(response, request, env);
  },
};
