import existingWorker from "./entry";
import type { Env } from "./types";
import { withCors } from "./cors";
import { resolveSession } from "./middleware/requireAuth";
import { handleDocumentationRoute } from "./documentation/routes";
import { handlePlatformRoute, runScheduledMaintenance } from "./platform/routes";
import { handleNotificationRoute } from "./platform/notification-routes";
import { handleAccountRoute } from "./account/routes";
import { verifyTwoFactorLogin } from "./auth/routes";
import { processFileDeletionQueue } from "./storage/file-deletion";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function isFeaturePath(path: string): boolean {
  return (
    path === "/api/auth/2fa" ||
    path.startsWith("/api/account/") ||
    path.includes("/documentation") ||
    path.includes("/documents/") ||
    path.endsWith("/dashboard") ||
    path.startsWith("/api/tenant/notifications") ||
    path.startsWith("/api/unit-leader/notifications") ||
    path === "/api/owner/lifecycle" ||
    path.startsWith("/api/owner/tenancies/") ||
    /^\/api\/owner\/tenants\/[^/]+\/(move|permanent-delete)$/.test(path) ||
    path === "/api/owner/retention"
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === "OPTIONS" || !isFeaturePath(path)) {
      return existingWorker.fetch(request, env);
    }

    try {
      if (path === "/api/auth/2fa") {
        if (request.method !== "POST") {
          return withCors(json({ error: "Not found." }, 404), request, env);
        }
        return withCors(await verifyTwoFactorLogin(request, env), request, env);
      }

      const actor = await resolveSession(request, env);
      if (!actor) return withCors(json({ error: "Not authorized." }, 401), request, env);

      if (path.startsWith("/api/account/")) {
        const account = await handleAccountRoute(request, env, actor);
        return withCors(account ?? json({ error: "Not found." }, 404), request, env);
      }

      const documentation = await handleDocumentationRoute(request, env, actor);
      if (documentation) return withCors(documentation, request, env);

      const notifications = await handleNotificationRoute(request, env, actor);
      if (notifications) return withCors(notifications, request, env);

      const platform = await handlePlatformRoute(request, env, actor);
      if (platform) return withCors(platform, request, env);

      return existingWorker.fetch(request, env);
    } catch (error) {
      console.error(error);
      return withCors(json({ error: "Internal server error." }, 500), request, env);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      await runScheduledMaintenance(env);
      await processFileDeletionQueue(env);
    })());
  },
};
