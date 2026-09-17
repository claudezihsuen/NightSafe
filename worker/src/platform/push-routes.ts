import type { Env, SessionUser } from "../types";
import { getVapidPublicKey } from "./web-push";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

interface SubscriptionBody {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 10 || value.length > 4096) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export async function handlePushRoute(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/push/")) return null;

  if (path === "/api/push/public-key" && request.method === "GET") {
    return json({ publicKey: await getVapidPublicKey(env) });
  }

  if (path === "/api/push/subscriptions" && request.method === "POST") {
    const body = await request.json<SubscriptionBody>().catch(() => null);
    if (!body || !validEndpoint(body.endpoint)) return json({ error: "Invalid push subscription." }, 400);

    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh.slice(0, 1024) : null;
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth.slice(0, 1024) : null;
    const id = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id=excluded.user_id,
         p256dh=excluded.p256dh,
         auth=excluded.auth,
         updated_at=datetime('now')`,
    ).bind(id, actor.id, body.endpoint, p256dh, auth).run();

    return json({ ok: true });
  }

  if (path === "/api/push/subscriptions" && request.method === "DELETE") {
    const body = await request.json<SubscriptionBody>().catch(() => null);
    if (!body || !validEndpoint(body.endpoint)) return json({ error: "Invalid push subscription." }, 400);
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?")
      .bind(actor.id, body.endpoint)
      .run();
    return json({ ok: true });
  }

  return json({ error: "Not found." }, 404);
}
