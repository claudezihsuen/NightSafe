import type { Env, SessionUser } from "../types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function notificationBase(path: string, actor: SessionUser): string | null {
  const generic = "/api/notifications";
  if (path === generic || path.startsWith(`${generic}/`)) return generic;

  if (actor.role === "TENANT") {
    const tenant = "/api/tenant/notifications";
    if (path === tenant || path.startsWith(`${tenant}/`)) return tenant;
  }
  if (actor.role === "UNIT_LEADER") {
    const leader = "/api/unit-leader/notifications";
    if (path === leader || path.startsWith(`${leader}/`)) return leader;
  }
  return null;
}

function requestedLimit(request: Request): number {
  const raw = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  if (!Number.isFinite(raw)) return 100;
  return Math.min(100, Math.max(1, Math.trunc(raw)));
}

/** Shared in-app notification API for every authenticated NightSafe role. */
export async function handleNotificationRoute(
  request: Request,
  env: Env,
  actor: SessionUser,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const base = notificationBase(path, actor);
  if (!base) return null;

  if (path === base && request.method === "GET") {
    const limit = requestedLimit(request);
    const { results } = await env.DB.prepare(
      `SELECT id,title,body,type,related_type,related_id,href,read_at,created_at
       FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?`,
    ).bind(actor.id, limit).all();
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
    ).bind(now, decodeURIComponent(match[1]), actor.id).run();
    if ((result.meta.changes ?? 0) !== 1) return json({ error: "Notification not found." }, 404);
    return json({ ok: true, readAt: now });
  }

  return json({ error: "Not found." }, 404);
}
