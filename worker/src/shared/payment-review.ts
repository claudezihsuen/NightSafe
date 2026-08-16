import type { Env, SessionUser, Role } from "../types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export interface ReviewablePayment {
  id: string;
  lease_id: string;
  month: string;
  status: "WAITING_PAYMENT" | "PENDING_REVIEW" | "PAYMENT_CONFIRMED";
  tenant_id: string;
  receipt_key: string | null;
}

export type FetchReviewablePayment = (
  env: Env,
  actor: SessionUser,
  paymentId: string,
) => Promise<ReviewablePayment | null>;

/** PENDING_REVIEW -> PAYMENT_CONFIRMED, recording reviewer_id/reviewed_at/reviewer_role. */
export async function confirmPaymentCore(
  env: Env,
  actor: SessionUser,
  paymentId: string,
  reviewerRole: Role,
  fetchPayment: FetchReviewablePayment,
): Promise<Response> {
  const payment = await fetchPayment(env, actor, paymentId);
  if (!payment) return json({ error: "Payment not found." }, 404);
  if (payment.status !== "PENDING_REVIEW") {
    return json({ error: "This payment isn't awaiting review." }, 409);
  }

  const now = new Date().toISOString();
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE rent_payments
       SET status = 'PAYMENT_CONFIRMED', payment_date = ?, reviewed_by = ?, reviewed_at = ?, reviewer_role = ?
       WHERE id = ?`,
    ).bind(now, actor.id, now, reviewerRole, payment.id),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'RENT_PAYMENT_CONFIRMED', 'rent_payment', ?, ?)`,
    ).bind(
      auditLogId,
      actor.id,
      payment.id,
      JSON.stringify({ tenantId: payment.tenant_id, leaseId: payment.lease_id, month: payment.month, reviewerRole }),
    ),
  ]);

  return json({
    payment: {
      ...payment,
      status: "PAYMENT_CONFIRMED",
      payment_date: now,
      reviewed_by: actor.id,
      reviewed_at: now,
      reviewer_role: reviewerRole,
    },
  });
}

/** PENDING_REVIEW -> WAITING_PAYMENT, recording reviewer_id/reviewed_at/reviewer_role. Body: { reason?: string }. */
export async function rejectPaymentCore(
  request: Request,
  env: Env,
  actor: SessionUser,
  paymentId: string,
  reviewerRole: Role,
  fetchPayment: FetchReviewablePayment,
): Promise<Response> {
  const payment = await fetchPayment(env, actor, paymentId);
  if (!payment) return json({ error: "Payment not found." }, 404);
  if (payment.status !== "PENDING_REVIEW") {
    return json({ error: "This payment isn't awaiting review." }, 409);
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  const now = new Date().toISOString();
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE rent_payments
       SET status = 'WAITING_PAYMENT', receipt_key = NULL, submitted_at = NULL,
           reviewed_by = ?, reviewed_at = ?, reviewer_role = ?
       WHERE id = ?`,
    ).bind(actor.id, now, reviewerRole, payment.id),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'RENT_PAYMENT_REJECTED', 'rent_payment', ?, ?)`,
    ).bind(
      auditLogId,
      actor.id,
      payment.id,
      JSON.stringify({
        tenantId: payment.tenant_id,
        leaseId: payment.lease_id,
        month: payment.month,
        reviewerRole,
        reason,
      }),
    ),
  ]);

  return json({
    payment: {
      ...payment,
      status: "WAITING_PAYMENT",
      receipt_key: null,
      submitted_at: null,
      reviewed_by: actor.id,
      reviewed_at: now,
      reviewer_role: reviewerRole,
    },
  });
}

/** GET receipt bytes for a payment already verified as in-scope by the caller. */
export async function streamReceipt(env: Env, payment: { receipt_key: string | null }): Promise<Response> {
  if (!payment.receipt_key) return new Response("Not found.", { status: 404 });
  const object = await env.FILES.get(payment.receipt_key);
  if (!object) return new Response("Not found.", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=0",
    },
  });
}
