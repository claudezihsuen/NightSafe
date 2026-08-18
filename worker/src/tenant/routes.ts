import type { Env, SessionUser } from "../types";
import { getDepositBreakdown, streamDepositReceipt } from "../shared/deposits";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export interface RentPaymentRow {
  id: string;
  lease_id: string;
  month: string; // 'YYYY-MM'
  amount: number; // cents
  due_date: string; // 'YYYY-MM-DD'
  status: "WAITING_PAYMENT" | "PENDING_REVIEW" | "PAYMENT_CONFIRMED";
  receipt_key: string | null;
  submitted_at: string | null;
  payment_date: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  created_at: string;
}

const SELECT_TENANT_PAYMENT = `
  SELECT rent_payments.*, reviewer.name AS reviewed_by_name
  FROM rent_payments
  JOIN leases ON leases.id = rent_payments.lease_id
  LEFT JOIN users AS reviewer ON reviewer.id = rent_payments.reviewed_by
  WHERE leases.tenant_id = ?
`;

/** GET /api/tenant/payments — this tenant's rent payments, most recent month first. */
export async function listPayments(env: Env, actor: SessionUser): Promise<Response> {
  const { results } = await env.DB.prepare(`${SELECT_TENANT_PAYMENT} ORDER BY rent_payments.month DESC`)
    .bind(actor.id)
    .all<RentPaymentRow>();

  return json({ payments: results ?? [] });
}

async function getOwnedPayment(env: Env, actor: SessionUser, paymentId: string): Promise<RentPaymentRow | null> {
  const row = await env.DB.prepare(`${SELECT_TENANT_PAYMENT} AND rent_payments.id = ?`)
    .bind(actor.id, paymentId)
    .first<RentPaymentRow>();
  return row ?? null;
}

/** GET /api/tenant/payments/:id */
export async function getPayment(env: Env, actor: SessionUser, paymentId: string): Promise<Response> {
  const payment = await getOwnedPayment(env, actor, paymentId);
  if (!payment) return json({ error: "Payment not found." }, 404);
  return json({ payment });
}

/**
 * POST /api/tenant/payments/:id/submit (multipart/form-data)
 * Fields: receipt (file, required).
 * Only allowed while WAITING_PAYMENT — covers both a fresh month and one
 * reverted to WAITING_PAYMENT after a (not-yet-built) rejection.
 */
export async function submitPayment(
  request: Request,
  env: Env,
  actor: SessionUser,
  paymentId: string,
): Promise<Response> {
  const payment = await getOwnedPayment(env, actor, paymentId);
  if (!payment) return json({ error: "Payment not found." }, 404);

  if (payment.status !== "WAITING_PAYMENT") {
    return json({ error: "This payment isn't awaiting submission." }, 409);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Invalid form data." }, 400);

  const receipt = form.get("receipt");
  if (!(receipt instanceof File) || receipt.size === 0) {
    return json({ error: "A receipt file is required." }, 400);
  }

  const receiptKey = `receipts/${actor.id}/${payment.id}/${Date.now()}-${receipt.name}`;
  await env.FILES.put(receiptKey, await receipt.arrayBuffer(), {
    httpMetadata: { contentType: receipt.type || "application/octet-stream" },
  });

  const submittedAt = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE rent_payments SET status = 'PENDING_REVIEW', receipt_key = ?, submitted_at = ? WHERE id = ?`,
  )
    .bind(receiptKey, submittedAt, payment.id)
    .run();

  return json({
    payment: { ...payment, status: "PENDING_REVIEW", receipt_key: receiptKey, submitted_at: submittedAt },
  });
}

/** GET /api/tenant/payments/:id/receipt — streams the tenant's own uploaded receipt. */
export async function getReceipt(env: Env, actor: SessionUser, paymentId: string): Promise<Response> {
  const payment = await getOwnedPayment(env, actor, paymentId);
  if (!payment || !payment.receipt_key) {
    return new Response("Not found.", { status: 404 });
  }

  const object = await env.FILES.get(payment.receipt_key);
  if (!object) return new Response("Not found.", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=0",
    },
  });
}

async function getMyLeaseId(env: Env, actor: SessionUser): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT id FROM leases WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(actor.id)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * GET /api/tenant/deposit — this tenant's own deposit breakdown. Internal
 * Owner/Agent-only fields (item notes, who created each item) are stripped
 * before returning; everything else needed for the tenant-facing summary
 * (items, amounts, deductions, final refund calculation) is included.
 */
export async function getMyDeposit(env: Env, actor: SessionUser): Promise<Response> {
  const leaseId = await getMyLeaseId(env, actor);
  if (!leaseId) return json({ error: "No tenancy found." }, 404);

  const breakdown = await getDepositBreakdown(env, leaseId);

  const items = breakdown.items.map(({ notes, created_by, ...rest }) => rest);

  return json({ ...breakdown, items });
}

/** GET /api/tenant/deposit/deductions/:id/receipt — supporting document for a deduction against this tenant's own deposit. */
export async function getMyDeductionReceipt(env: Env, actor: SessionUser, deductionId: string): Promise<Response> {
  const leaseId = await getMyLeaseId(env, actor);
  if (!leaseId) return new Response("Not found.", { status: 404 });

  const deduction = await env.DB.prepare(
    "SELECT receipt_key FROM deposit_deductions WHERE id = ? AND lease_id = ?",
  )
    .bind(deductionId, leaseId)
    .first<{ receipt_key: string | null }>();

  if (!deduction) return new Response("Not found.", { status: 404 });
  return streamDepositReceipt(env, deduction.receipt_key);
}
