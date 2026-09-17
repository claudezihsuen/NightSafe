import existingWorker from "./entry";
import type { Env } from "./types";
import { withCors } from "./cors";
import { resolveSession } from "./middleware/requireAuth";
import { handleDocumentationRoute } from "./documentation/routes";
import { handlePlatformRoute, runScheduledMaintenance } from "./platform/routes";
import { handleNotificationRoute } from "./platform/notification-routes";
import { handlePushRoute } from "./platform/push-routes";
import { processPendingWebPush } from "./platform/web-push";
import { handleAccountRoute } from "./account/routes";
import { disableTwoFactorSafe, enableTwoFactorSafe } from "./account/two-factor";
import { verifyTwoFactorLogin } from "./auth/routes";
import {
  completePasswordReset,
  requestPasswordReset,
  verifyPasswordReset,
} from "./auth/password-reset";
import { processFileDeletionQueue } from "./storage/file-deletion";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function isFeaturePath(path: string): boolean {
  return (
    path === "/api/auth/2fa" ||
    path.startsWith("/api/auth/password-reset/") ||
    path.startsWith("/api/account/") ||
    path.startsWith("/api/push/") ||
    path.includes("/documentation") ||
    path.includes("/documents/") ||
    path.endsWith("/dashboard") ||
    path.startsWith("/api/notifications") ||
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

      if (path.startsWith("/api/auth/password-reset/")) {
        if (request.method !== "POST") {
          return withCors(json({ error: "Not found." }, 404), request, env);
        }
        if (path === "/api/auth/password-reset/request") {
          return withCors(await requestPasswordReset(request, env), request, env);
        }
        if (path === "/api/auth/password-reset/verify") {
          return withCors(await verifyPasswordReset(request, env), request, env);
        }
        if (path === "/api/auth/password-reset/complete") {
          return withCors(await completePasswordReset(request, env), request, env);
        }
        return withCors(json({ error: "Not found." }, 404), request, env);
      }

      const actor = await resolveSession(request, env);
      if (!actor) return withCors(json({ error: "Not authorized." }, 401), request, env);

      const push = await handlePushRoute(request, env, actor);
      if (push) return withCors(push, request, env);

      if (path.startsWith("/api/account/")) {
        if (path === "/api/account/two-factor/enable" && request.method === "POST") {
          return withCors(await enableTwoFactorSafe(request, env, actor), request, env);
        }
        if (path === "/api/account/two-factor" && request.method === "DELETE") {
          return withCors(await disableTwoFactorSafe(request, env, actor), request, env);
        }
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

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      await processPendingWebPush(env);
      if (controller.cron === "17 3 * * *") {
        await runScheduledMaintenance(env);
        await processFileDeletionQueue(env);
      }
    })());
  },
};
