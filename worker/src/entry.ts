import coreWorker from "./index";
import type { Env } from "./types";
import { withCors } from "./cors";
import { resolveSession, requireRole } from "./middleware/requireAuth";
import { createAdminAccount, initiatePasswordReset, listUsers, setUserStatus } from "./admin/routes";
import { markMyNotificationsRead } from "./tenant/routes";
import { downloadOwnerAgreement, listOwnerAgreements } from "./owner/agreements";

const ADMIN_RESET_PASSWORD = /^\/api\/admin\/users\/([^/]+)\/reset-password$/;
const ADMIN_USER_STATUS = /^\/api\/admin\/users\/([^/]+)\/status$/;
const TENANT_NOTIFICATIONS_READ_ALL = "/api/tenant/notifications/read-all";
const OWNER_AGREEMENT_DOWNLOAD = /^\/api\/owner\/agreements\/([^/]+)\/download$/;

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
    const isOwnerAgreementRoute =
      pathname === "/api/owner/agreements" || OWNER_AGREEMENT_DOWNLOAD.test(pathname);

    // Keep all existing core routing untouched unless this thin entry layer
    // explicitly owns the route.
    if (!isAdminRoute && !isTenantNotificationMutation && !isOwnerAgreementRoute) {
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
      } else if (isOwnerAgreementRoute) {
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else if (pathname === "/api/owner/agreements" && request.method === "GET") {
          response = await listOwnerAgreements(env, sessionUser!);
        } else if (OWNER_AGREEMENT_DOWNLOAD.test(pathname) && request.method === "GET") {
          const [, agreementId] = pathname.match(OWNER_AGREEMENT_DOWNLOAD)!;
          response = await downloadOwnerAgreement(env, sessionUser!, agreementId);
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
