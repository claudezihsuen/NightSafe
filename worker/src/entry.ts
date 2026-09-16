import coreWorker from "./index";
import type { Env } from "./types";
import { withCors } from "./cors";
import { resolveSession, requireRole } from "./middleware/requireAuth";
import { initiatePasswordReset, listUsers, setUserStatus } from "./admin/routes";

const ADMIN_RESET_PASSWORD = /^\/api\/admin\/users\/([^/]+)\/reset-password$/;
const ADMIN_USER_STATUS = /^\/api\/admin\/users\/([^/]+)\/status$/;

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

    // Keep all existing Owner/Agent/Unit Leader/Tenant/Auth routing untouched.
    if (!pathname.startsWith("/api/admin/")) {
      return coreWorker.fetch(request, env);
    }

    // Reuse the core Worker's preflight handling so admin routes get the same
    // credentials-aware CORS policy as the rest of NightSafe.
    if (request.method === "OPTIONS") {
      return coreWorker.fetch(request, env);
    }

    let response: Response;

    try {
      const sessionUser = await resolveSession(request, env);
      if (!requireRole(sessionUser, ["ADMIN"])) {
        response = json({ error: "Not authorized." }, 403);
      } else if (pathname === "/api/admin/users" && request.method === "GET") {
        response = await listUsers(env);
      } else if (ADMIN_RESET_PASSWORD.test(pathname) && request.method === "POST") {
        const [, userId] = pathname.match(ADMIN_RESET_PASSWORD)!;
        response = await initiatePasswordReset(env, sessionUser!, userId);
      } else if (ADMIN_USER_STATUS.test(pathname) && request.method === "PATCH") {
        const [, userId] = pathname.match(ADMIN_USER_STATUS)!;
        response = await setUserStatus(request, env, sessionUser!, userId);
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
