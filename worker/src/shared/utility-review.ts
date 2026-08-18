import type { Env, SessionUser, Role } from "../types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export interface ReviewableUtility {
  id: string;
  unit_id: string;
  type: "WATER" | "ELECTRICITY";
  month: string;
  status: "WAITING_PAYMENT" | "PENDING_REVIEW" | "PAYMENT_CONFIRMED";
  receipt_key: string | null;
}

export type FetchReviewableUtility = (
  env: Env,
  actor: SessionUser,
  utilityId: string,
) => Promise<ReviewableUtility | null>;

/** PENDING_REVIEW -> PAYMENT_CONFIRMED, recording reviewer_id/reviewed_at/reviewer_role. */
export async function confirmUtilityCore(
  env: Env,
  actor: SessionUser,
  utilityId: string,
  reviewerRole: Role,
  fetchUtility: FetchReviewableUtility,
): Promise<Response> {
  const utility = await fetchUtility(env, actor, utilityId);
  if (!utility) return json({ error: "Utility payment not found." }, 404);
  if (utility.status !== "PENDING_REVIEW") {
    return json({ error: "This payment isn't awaiting review." }, 409);
  }

  const now = new Date().toISOString();
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE utility_payments
       SET status = 'PAYMENT_CONFIRMED', payment_date = ?, reviewed_by = ?, reviewed_at = ?, reviewer_role = ?
       WHERE id = ?`,
    ).bind(now, actor.id, now, reviewerRole, utility.id),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'UTILITY_PAYMENT_CONFIRMED', 'utility_payment', ?, ?)`,
    ).bind(
      auditLogId,
      actor.id,
      utility.id,
      JSON.stringify({ unitId: utility.unit_id, type: utility.type, month: utility.month, reviewerRole }),
    ),
  ]);

  return json({
    payment: {
      ...utility,
      status: "PAYMENT_CONFIRMED",
      payment_date: now,
      reviewed_by: actor.id,
      reviewed_at: now,
      reviewer_role: reviewerRole,
    },
  });
}

/** PENDING_REVIEW -> WAITING_PAYMENT, recording reviewer_id/reviewed_at/reviewer_role. Body: { reason?: string }. */
export async function rejectUtilityCore(
  request: Request,
  env: Env,
  actor: SessionUser,
  utilityId: string,
  reviewerRole: Role,
  fetchUtility: FetchReviewableUtility,
): Promise<Response> {
  const utility = await fetchUtility(env, actor, utilityId);
  if (!utility) return json({ error: "Utility payment not found." }, 404);
  if (utility.status !== "PENDING_REVIEW") {
    return json({ error: "This payment isn't awaiting review." }, 409);
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  const now = new Date().toISOString();
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE utility_payments
       SET status = 'WAITING_PAYMENT', receipt_key = NULL, submitted_at = NULL,
           reviewed_by = ?, reviewed_at = ?, reviewer_role = ?
       WHERE id = ?`,
    ).bind(actor.id, now, reviewerRole, utility.id),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'UTILITY_PAYMENT_REJECTED', 'utility_payment', ?, ?)`,
    ).bind(
      auditLogId,
      actor.id,
      utility.id,
      JSON.stringify({
        unitId: utility.unit_id,
        type: utility.type,
        month: utility.month,
        reviewerRole,
        reason,
      }),
    ),
  ]);

  return json({
    payment: {
      ...utility,
      status: "WAITING_PAYMENT",
      receipt_key: null,
      submitted_at: null,
      reviewed_by: actor.id,
      reviewed_at: now,
      reviewer_role: reviewerRole,
    },
  });
}

/** GET receipt bytes for a utility payment already verified as in-scope by the caller. */
export async function streamUtilityReceipt(env: Env, utility: { receipt_key: string | null }): Promise<Response> {
  if (!utility.receipt_key) return new Response("Not found.", { status: 404 });
  const object = await env.FILES.get(utility.receipt_key);
  if (!object) return new Response("Not found.", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=0",
    },
  });
}
