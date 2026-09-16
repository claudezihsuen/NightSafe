import coreWorker from "./index";
import type { Env } from "./types";
import { withCors } from "./cors";
import { resolveSession, requireRole } from "./middleware/requireAuth";
import { createAdminAccount, initiatePasswordReset, listUsers, setUserStatus } from "./admin/routes";
import { markMyNotificationsRead } from "./tenant/routes";

const ADMIN_RESET_PASSWORD = /^\/api\/admin\/users\/([^/]+)\/reset-password$/;
const ADMIN_USER_STATUS = /^\/api\/admin\/users\/([^/]+)\/status$/;
const TENANT_NOTIFICATIONS_READ_ALL = "/api/tenant/notifications/read-all";

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
    const isAdminRoute = pathname.startsWith("/api/admin/");
    const isTenantNotificationMutation = pathname === TENANT_NOTIFICATIONS_READ_ALL;

    // Keep all existing core routing untouched unless this thin entry layer
    // explicitly owns the route.
    if (!isAdminRoute && !isTenantNotificationMutation) {
      return coreWorker.fetch(request, env);
    }

    // Reuse the core Worker's preflight handling so these routes get the same
    // credentials-aware CORS policy as the rest of NightSafe.
    if (request.method === "OPTIONS") {
      return coreWorker.fetch(request, env);
    }

    let response: Response;

    try {
      const sessionUser = await resolveSession(request, env);

      if (isTenantNotificationMutation) {
        if (!requireRole(sessionUser, ["TENANT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else if (request.method === "POST") {
          response = await markMyNotificationsRead(env, sessionUser!);
        } else {
          response = json({ error: "Not found." }, 404);
        }
      } else if (!requireRole(sessionUser, ["SUPER_ADMIN", "ADMIN"])) {
        response = json({ error: "Not authorized." }, 403);
      } else if (pathname === "/api/admin/users" && request.method === "GET") {
        response = await listUsers(env);
      } else if (pathname === "/api/admin/admins" && request.method === "POST") {
        response = await createAdminAccount(request, env, sessionUser!);
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
