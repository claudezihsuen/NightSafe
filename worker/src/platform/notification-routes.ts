import type { Env, SessionUser } from "../types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function prefixFor(actor: SessionUser): "tenant" | "unit-leader" | null {
  if (actor.role === "TENANT") return "tenant";
  if (actor.role === "UNIT_LEADER") return "unit-leader";
  return null;
}

/** Shared in-app notification API for roles that currently receive notifications. */
export async function handleNotificationRoute(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response | null> {
  const prefix = prefixFor(actor);
  if (!prefix) return null;
  const path = new URL(request.url).pathname;
  const base = `/api/${prefix}/notifications`;
  if (!path.startsWith(base)) return null;

  if (path === base && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id,title,body,type,related_type,related_id,href,read_at,created_at
       FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100`,
    ).bind(actor.id).all();
    const unread = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND read_at IS NULL",
    ).bind(actor.id).first<{ count: number }>();
    return json({ notifications: results ?? [], unreadCount: unread?.count ?? 0 });
  }

  if (path === `${base}/read-all` && request.method === "POST") {
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL")
      .bind(now, actor.id).run();
    return json({ ok: true, readAt: now });
  }

  const match = path.match(new RegExp(`^${base.replaceAll("/", "\\/")}\/([^/]+)\/read$`));
  if (match && request.method === "POST") {
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      "UPDATE notifications SET read_at=COALESCE(read_at, ?) WHERE id=? AND user_id=?",
    ).bind(now, match[1], actor.id).run();
    if ((result.meta.changes ?? 0) !== 1) return json({ error: "Notification not found." }, 404);
    return json({ ok: true, readAt: now });
  }

  return json({ error: "Not found." }, 404);
}
