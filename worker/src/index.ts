import type { Env } from "./types";
import { corsHeaders, withCors } from "./cors";
import { resolveSession, requireRole } from "./middleware/requireAuth";
import { login, logout, me, getInvite, activate } from "./auth/routes";
import { listProperties, createTenant } from "./owner/routes";
import { listPayments, getPayment, submitPayment, getReceipt } from "./tenant/routes";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TENANT_PAYMENT_ID = /^\/api\/tenant\/payments\/([^/]+)$/;
const TENANT_PAYMENT_SUBMIT = /^\/api\/tenant\/payments\/([^/]+)\/submit$/;
const TENANT_PAYMENT_RECEIPT = /^\/api\/tenant\/payments\/([^/]+)\/receipt$/;

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
      } else if (pathname.startsWith("/api/auth/invite/") && method === "GET") {
        const token = pathname.split("/").pop()!;
        response = await getInvite(env, token);
      } else if (pathname.startsWith("/api/auth/activate/") && method === "POST") {
        const token = pathname.split("/").pop()!;
        response = await activate(request, env, token);
      } else if (pathname === "/api/owner/properties" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await listProperties(env, sessionUser!);
        }
      } else if (pathname === "/api/owner/tenants" && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await createTenant(request, env, sessionUser!);
        }
      } else if (pathname === "/api/tenant/payments" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["TENANT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await listPayments(env, sessionUser!);
        }
      } else if (TENANT_PAYMENT_SUBMIT.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["TENANT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(TENANT_PAYMENT_SUBMIT)!;
          response = await submitPayment(request, env, sessionUser!, id);
        }
      } else if (TENANT_PAYMENT_RECEIPT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["TENANT"])) {
          response = new Response("Not authorized.", { status: 403 });
        } else {
          const [, id] = pathname.match(TENANT_PAYMENT_RECEIPT)!;
          response = await getReceipt(env, sessionUser!, id);
        }
      } else if (TENANT_PAYMENT_ID.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["TENANT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(TENANT_PAYMENT_ID)!;
          response = await getPayment(env, sessionUser!, id);
        }
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
