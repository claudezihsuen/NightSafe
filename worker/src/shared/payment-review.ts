import type { Env, SessionUser, Role } from "../types";
import { streamPrivateAttachment } from "./file-security";

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
  const update = await env.DB.prepare(
    `UPDATE rent_payments
     SET status = 'PAYMENT_CONFIRMED', payment_date = ?, reviewed_by = ?, reviewed_at = ?, reviewer_role = ?
     WHERE id = ? AND status = 'PENDING_REVIEW'`,
  )
    .bind(now, actor.id, now, reviewerRole, payment.id)
    .run();

  if ((update.meta.changes ?? 0) !== 1) {
    return json({ error: "This payment was already reviewed. Refresh and try again." }, 409);
  }

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'RENT_PAYMENT_CONFIRMED', 'rent_payment', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      actor.id,
      payment.id,
      JSON.stringify({ tenantId: payment.tenant_id, leaseId: payment.lease_id, month: payment.month, reviewerRole }),
    ),
    env.DB.prepare(
      `INSERT INTO notifications (id, user_id, title, body)
       VALUES (?, ?, 'Rent payment confirmed', ?)`,
    ).bind(
      crypto.randomUUID(),
      payment.tenant_id,
      `Your rent payment for ${payment.month} has been confirmed.`,
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

  const update = await env.DB.prepare(
    `UPDATE rent_payments
     SET status = 'WAITING_PAYMENT', receipt_key = NULL, submitted_at = NULL,
         reviewed_by = ?, reviewed_at = ?, reviewer_role = ?
     WHERE id = ? AND status = 'PENDING_REVIEW'`,
  )
    .bind(actor.id, now, reviewerRole, payment.id)
    .run();

  if ((update.meta.changes ?? 0) !== 1) {
    return json({ error: "This payment was already reviewed. Refresh and try again." }, 409);
  }

  const reasonText = reason ? ` Reason: ${reason.slice(0, 300)}` : "";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'RENT_PAYMENT_REJECTED', 'rent_payment', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
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
    env.DB.prepare(
      `INSERT INTO notifications (id, user_id, title, body)
       VALUES (?, ?, 'Rent payment needs attention', ?)`,
    ).bind(
      crypto.randomUUID(),
      payment.tenant_id,
      `Your rent payment for ${payment.month} was not accepted. Please upload a new receipt.${reasonText}`,
    ),
  ]);

  if (payment.receipt_key) {
    await env.FILES.delete(payment.receipt_key).catch(() => undefined);
  }

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
export async function streamReceipt(env: Env, payment: { receipt_key: string | null; month?: string }): Promise<Response> {
  return streamPrivateAttachment(env, payment.receipt_key, payment.month ? `rent-receipt-${payment.month}` : "rent-receipt");
}
