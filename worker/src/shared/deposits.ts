import type { Env, SessionUser } from "../types";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export interface DepositItemRow {
  id: string;
  lease_id: string;
  name: string;
  type: string;
  description: string | null;
  quantity: number;
  unit_amount: number;
  total_amount: number;
  currency: string;
  refundable: number; // 0 | 1
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface DepositDeductionRow {
  id: string;
  lease_id: string;
  deposit_item_id: string | null;
  name: string;
  amount: number;
  reason: string;
  description: string | null;
  receipt_key: string | null;
  created_at: string;
}

export interface DepositReturnRow {
  id: string;
  lease_id: string;
  amount: number;
  returned_at: string;
  notes: string | null;
  created_at: string;
}

interface PaymentTotalRow {
  deposit_item_id: string;
  paid: number;
}

/** Full breakdown for a lease: items (with amount paid + status), deductions, returns, and lease-level totals. */
export async function getDepositBreakdown(env: Env, leaseId: string) {
  const [{ results: items }, { results: paidTotals }, { results: deductions }, { results: returns }, lease] =
    await Promise.all([
      env.DB.prepare("SELECT * FROM deposit_items WHERE lease_id = ? ORDER BY created_at ASC")
        .bind(leaseId)
        .all<DepositItemRow>(),
      env.DB.prepare(
        `SELECT deposit_payments.deposit_item_id, SUM(deposit_payments.amount) AS paid
         FROM deposit_payments
         JOIN deposit_items ON deposit_items.id = deposit_payments.deposit_item_id
         WHERE deposit_items.lease_id = ?
         GROUP BY deposit_payments.deposit_item_id`,
      )
        .bind(leaseId)
        .all<PaymentTotalRow>(),
      env.DB.prepare("SELECT * FROM deposit_deductions WHERE lease_id = ? ORDER BY created_at DESC")
        .bind(leaseId)
        .all<DepositDeductionRow>(),
      env.DB.prepare("SELECT * FROM deposit_returns WHERE lease_id = ? ORDER BY returned_at DESC")
        .bind(leaseId)
        .all<DepositReturnRow>(),
      env.DB.prepare("SELECT deposit_finalized_at FROM leases WHERE id = ?")
        .bind(leaseId)
        .first<{ deposit_finalized_at: string | null }>(),
    ]);

  const paidByItem = new Map((paidTotals ?? []).map((p) => [p.deposit_item_id, p.paid]));

  const itemsWithPayment = (items ?? []).map((item) => {
    const amountPaid = paidByItem.get(item.id) ?? 0;
    const paymentStatus: "EXPECTED" | "PARTIALLY_PAID" | "FULLY_PAID" =
      amountPaid <= 0 ? "EXPECTED" : amountPaid < item.total_amount ? "PARTIALLY_PAID" : "FULLY_PAID";
    return { ...item, amountPaid, paymentStatus };
  });

  const totalDeposit = itemsWithPayment.reduce((sum, i) => sum + i.total_amount, 0);
  const totalRefundableDeposit = itemsWithPayment
    .filter((i) => i.refundable === 1)
    .reduce((sum, i) => sum + i.total_amount, 0);
  const totalPaid = itemsWithPayment.reduce((sum, i) => sum + i.amountPaid, 0);
  const totalDeducted = (deductions ?? []).reduce((sum, d) => sum + d.amount, 0);
  const totalReturned = (returns ?? []).reduce((sum, r) => sum + r.amount, 0);
  const amountHeld = Math.max(0, totalPaid - totalDeducted - totalReturned);
  const remainingRefundable = Math.max(0, totalRefundableDeposit - totalDeducted - totalReturned);

  const paymentStatus: "EXPECTED" | "PARTIALLY_PAID" | "FULLY_PAID" =
    totalPaid <= 0 ? "EXPECTED" : totalPaid < totalDeposit ? "PARTIALLY_PAID" : "FULLY_PAID";

  const refundStatus: "NOT_APPLICABLE" | "HELD" | "PARTIALLY_RETURNED" | "FULLY_RETURNED" =
    totalPaid <= 0
      ? "NOT_APPLICABLE"
      : totalReturned <= 0
        ? "HELD"
        : amountHeld <= 0
          ? "FULLY_RETURNED"
          : "PARTIALLY_RETURNED";

  return {
    items: itemsWithPayment,
    deductions: deductions ?? [],
    returns: returns ?? [],
    summary: {
      depositStatus: lease?.deposit_finalized_at ? "FINALIZED" : "DRAFT",
      finalizedAt: lease?.deposit_finalized_at ?? null,
      totalDeposit,
      totalRefundableDeposit,
      totalPaid,
      totalDeducted,
      totalReturned,
      amountHeld,
      remainingRefundable,
      paymentStatus,
      refundStatus,
    },
  };
}

export interface DepositItemInput {
  name: string;
  type: string;
  description?: string | null;
  quantity: number;
  unitAmountDollars: number;
  currency?: string;
  refundable: boolean;
  notes?: string | null;
}

function validateItemInput(input: Partial<DepositItemInput>): string | null {
  if (!input.name || !input.name.trim()) return "Name is required.";
  if (!input.type || !input.type.trim()) return "Type is required.";
  if (!Number.isFinite(input.quantity) || (input.quantity ?? 0) <= 0) return "Quantity must be a positive number.";
  if (!Number.isFinite(input.unitAmountDollars) || (input.unitAmountDollars ?? 0) < 0) {
    return "Unit amount must be zero or a positive number.";
  }
  return null;
}

async function isDepositFinalized(env: Env, leaseId: string): Promise<boolean> {
  const lease = await env.DB.prepare("SELECT deposit_finalized_at FROM leases WHERE id = ?")
    .bind(leaseId)
    .first<{ deposit_finalized_at: string | null }>();
  return Boolean(lease?.deposit_finalized_at);
}

export async function createDepositItem(
  env: Env,
  actor: SessionUser,
  leaseId: string,
  input: DepositItemInput,
): Promise<Response> {
  const error = validateItemInput(input);
  if (error) return json({ error }, 400);

  if (await isDepositFinalized(env, leaseId)) {
    return json({ error: "This deposit is finalized — add a deduction instead of a new item." }, 409);
  }

  const id = crypto.randomUUID();
  const unitAmountCents = Math.round(input.unitAmountDollars * 100);
  const totalAmountCents = Math.round(unitAmountCents * input.quantity);
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO deposit_items (id, lease_id, name, type, description, quantity, unit_amount, total_amount, currency, refundable, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      leaseId,
      input.name.trim(),
      input.type.trim(),
      input.description?.trim() || null,
      input.quantity,
      unitAmountCents,
      totalAmountCents,
      input.currency?.trim() || "MYR",
      input.refundable ? 1 : 0,
      input.notes?.trim() || null,
      actor.id,
    ),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'DEPOSIT_ITEM_CREATED', 'deposit_item', ?, ?)`,
    ).bind(auditLogId, actor.id, id, JSON.stringify({ leaseId, name: input.name, totalAmountCents })),
  ]);

  return json({ id }, 201);
}

export async function updateDepositItem(
  env: Env,
  actor: SessionUser,
  item: DepositItemRow,
  input: Partial<DepositItemInput>,
): Promise<Response> {
  if (await isDepositFinalized(env, item.lease_id)) {
    return json({ error: "This deposit is finalized and its items can no longer be edited." }, 409);
  }

  const merged: DepositItemInput = {
    name: input.name ?? item.name,
    type: input.type ?? item.type,
    description: input.description !== undefined ? input.description : item.description,
    quantity: input.quantity ?? item.quantity,
    unitAmountDollars: input.unitAmountDollars ?? item.unit_amount / 100,
    currency: input.currency ?? item.currency,
    refundable: input.refundable !== undefined ? input.refundable : item.refundable === 1,
    notes: input.notes !== undefined ? input.notes : item.notes,
  };

  const error = validateItemInput(merged);
  if (error) return json({ error }, 400);

  const unitAmountCents = Math.round(merged.unitAmountDollars * 100);
  const totalAmountCents = Math.round(unitAmountCents * merged.quantity);
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE deposit_items
       SET name = ?, type = ?, description = ?, quantity = ?, unit_amount = ?, total_amount = ?, currency = ?, refundable = ?, notes = ?
       WHERE id = ?`,
    ).bind(
      merged.name.trim(),
      merged.type.trim(),
      merged.description?.trim() || null,
      merged.quantity,
      unitAmountCents,
      totalAmountCents,
      merged.currency?.trim() || "MYR",
      merged.refundable ? 1 : 0,
      merged.notes?.trim() || null,
      item.id,
    ),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'DEPOSIT_ITEM_UPDATED', 'deposit_item', ?, ?)`,
    ).bind(auditLogId, actor.id, item.id, JSON.stringify({ leaseId: item.lease_id })),
  ]);

  return json({ ok: true });
}

export async function deleteDepositItem(env: Env, actor: SessionUser, item: DepositItemRow): Promise<Response> {
  if (await isDepositFinalized(env, item.lease_id)) {
    return json({ error: "This deposit is finalized and its items can no longer be removed." }, 409);
  }

  const auditLogId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM deposit_items WHERE id = ?").bind(item.id),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'DEPOSIT_ITEM_REMOVED', 'deposit_item', ?, ?)`,
    ).bind(auditLogId, actor.id, item.id, JSON.stringify({ leaseId: item.lease_id, name: item.name })),
  ]);

  return json({ ok: true });
}

export async function finalizeDeposit(env: Env, actor: SessionUser, leaseId: string): Promise<Response> {
  if (await isDepositFinalized(env, leaseId)) {
    return json({ error: "This deposit is already finalized." }, 409);
  }
  const { results: items } = await env.DB.prepare("SELECT id FROM deposit_items WHERE lease_id = ?")
    .bind(leaseId)
    .all();
  if (!items || items.length === 0) {
    return json({ error: "Add at least one deposit item before finalizing." }, 400);
  }

  const now = new Date().toISOString();
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare("UPDATE leases SET deposit_finalized_at = ? WHERE id = ?").bind(now, leaseId),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'DEPOSIT_FINALIZED', 'lease', ?, ?)`,
    ).bind(auditLogId, actor.id, leaseId, JSON.stringify({ leaseId })),
  ]);

  return json({ ok: true, finalizedAt: now });
}

export interface DepositPaymentInput {
  amountDollars: number;
  paidAt: string;
  method?: string | null;
}

export async function recordDepositPayment(
  env: Env,
  actor: SessionUser,
  item: DepositItemRow,
  input: DepositPaymentInput,
  receiptFile: File | null,
): Promise<Response> {
  if (!Number.isFinite(input.amountDollars) || input.amountDollars <= 0) {
    return json({ error: "Amount must be a positive number." }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidAt)) {
    return json({ error: "paidAt must be in YYYY-MM-DD format." }, 400);
  }

  const id = crypto.randomUUID();
  let receiptKey: string | null = null;
  if (receiptFile && receiptFile.size > 0) {
    receiptKey = `deposits/${item.lease_id}/payments/${item.id}/${Date.now()}-${receiptFile.name}`;
    await env.FILES.put(receiptKey, await receiptFile.arrayBuffer(), {
      httpMetadata: { contentType: receiptFile.type || "application/octet-stream" },
    });
  }

  const amountCents = Math.round(input.amountDollars * 100);
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO deposit_payments (id, deposit_item_id, amount, paid_at, method, receipt_key, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, item.id, amountCents, input.paidAt, input.method?.trim() || null, receiptKey, actor.id),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'DEPOSIT_PAYMENT_RECORDED', 'deposit_item', ?, ?)`,
    ).bind(auditLogId, actor.id, item.id, JSON.stringify({ leaseId: item.lease_id, amountCents })),
  ]);

  return json({ id }, 201);
}

export interface DeductionInput {
  name: string;
  amountDollars: number;
  reason: string;
  description?: string | null;
  depositItemId?: string | null;
  date: string;
}

export async function createDeduction(
  env: Env,
  actor: SessionUser,
  leaseId: string,
  input: DeductionInput,
  receiptFile: File | null,
): Promise<Response> {
  if (!input.name?.trim()) return json({ error: "Deduction name is required." }, 400);
  if (!input.reason?.trim()) return json({ error: "Reason is required." }, 400);
  if (!Number.isFinite(input.amountDollars) || input.amountDollars <= 0) {
    return json({ error: "Amount must be a positive number." }, 400);
  }

  const id = crypto.randomUUID();
  let receiptKey: string | null = null;
  if (receiptFile && receiptFile.size > 0) {
    receiptKey = `deposits/${leaseId}/deductions/${id}/${Date.now()}-${receiptFile.name}`;
    await env.FILES.put(receiptKey, await receiptFile.arrayBuffer(), {
      httpMetadata: { contentType: receiptFile.type || "application/octet-stream" },
    });
  }

  const amountCents = Math.round(input.amountDollars * 100);
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO deposit_deductions (id, lease_id, deposit_item_id, name, amount, reason, description, receipt_key, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      leaseId,
      input.depositItemId || null,
      input.name.trim(),
      amountCents,
      input.reason.trim(),
      input.description?.trim() || null,
      receiptKey,
      actor.id,
    ),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'DEPOSIT_DEDUCTION_CREATED', 'deposit_deduction', ?, ?)`,
    ).bind(auditLogId, actor.id, id, JSON.stringify({ leaseId, name: input.name, amountCents })),
  ]);

  return json({ id }, 201);
}

export async function deleteDeduction(env: Env, actor: SessionUser, deduction: DepositDeductionRow): Promise<Response> {
  const auditLogId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM deposit_deductions WHERE id = ?").bind(deduction.id),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'DEPOSIT_DEDUCTION_REMOVED', 'deposit_deduction', ?, ?)`,
    ).bind(auditLogId, actor.id, deduction.id, JSON.stringify({ leaseId: deduction.lease_id, name: deduction.name })),
  ]);
  return json({ ok: true });
}

export interface ReturnInput {
  amountDollars: number;
  returnedAt: string;
  notes?: string | null;
}

export async function recordReturn(env: Env, actor: SessionUser, leaseId: string, input: ReturnInput): Promise<Response> {
  if (!Number.isFinite(input.amountDollars) || input.amountDollars <= 0) {
    return json({ error: "Amount must be a positive number." }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.returnedAt)) {
    return json({ error: "returnedAt must be in YYYY-MM-DD format." }, 400);
  }

  const id = crypto.randomUUID();
  const amountCents = Math.round(input.amountDollars * 100);
  const auditLogId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO deposit_returns (id, lease_id, amount, returned_at, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, leaseId, amountCents, input.returnedAt, input.notes?.trim() || null, actor.id),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'DEPOSIT_RETURN_RECORDED', 'lease', ?, ?)`,
    ).bind(auditLogId, actor.id, leaseId, JSON.stringify({ leaseId, amountCents })),
  ]);

  return json({ id }, 201);
}

export async function streamDepositReceipt(env: Env, receiptKey: string | null): Promise<Response> {
  if (!receiptKey) return new Response("Not found.", { status: 404 });
  const object = await env.FILES.get(receiptKey);
  if (!object) return new Response("Not found.", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=0",
    },
  });
}

// ---------------------------------------------------------------------------
// Route factory — Owner and Agent get identical deposit-management routes,
// differing only in how "can this actor touch this lease" is decided.
// Item/deduction/payment scope checks fetch the row first, then delegate to
// the same per-lease check, so the check logic lives in exactly one place
// per role (in owner/routes.ts and agent/routes.ts respectively).
// ---------------------------------------------------------------------------

export type LeaseScopeCheck = (env: Env, actor: SessionUser, leaseId: string) => Promise<boolean>;

export function createDepositRoutes(verifyLease: LeaseScopeCheck) {
  async function getItemById(env: Env, itemId: string): Promise<DepositItemRow | null> {
    const row = await env.DB.prepare("SELECT * FROM deposit_items WHERE id = ?").bind(itemId).first<DepositItemRow>();
    return row ?? null;
  }

  async function getDeductionById(env: Env, deductionId: string): Promise<DepositDeductionRow | null> {
    const row = await env.DB.prepare("SELECT * FROM deposit_deductions WHERE id = ?")
      .bind(deductionId)
      .first<DepositDeductionRow>();
    return row ?? null;
  }

  async function getPaymentById(env: Env, paymentId: string) {
    const row = await env.DB.prepare("SELECT * FROM deposit_payments WHERE id = ?")
      .bind(paymentId)
      .first<{ id: string; deposit_item_id: string; receipt_key: string | null }>();
    return row ?? null;
  }

  return {
    async getDeposit(env: Env, actor: SessionUser, leaseId: string): Promise<Response> {
      if (!(await verifyLease(env, actor, leaseId))) return json({ error: "Lease not found." }, 404);
      return json(await getDepositBreakdown(env, leaseId));
    },

    async createItem(request: Request, env: Env, actor: SessionUser, leaseId: string): Promise<Response> {
      if (!(await verifyLease(env, actor, leaseId))) return json({ error: "Lease not found." }, 404);
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid request body." }, 400);
      const input: DepositItemInput = {
        name: body.name,
        type: body.type,
        description: body.description ?? null,
        quantity: Number(body.quantity),
        unitAmountDollars: Number(body.unitAmountDollars),
        currency: body.currency,
        refundable: Boolean(body.refundable),
        notes: body.notes ?? null,
      };
      return createDepositItem(env, actor, leaseId, input);
    },

    async updateItem(request: Request, env: Env, actor: SessionUser, itemId: string): Promise<Response> {
      const item = await getItemById(env, itemId);
      if (!item || !(await verifyLease(env, actor, item.lease_id))) {
        return json({ error: "Deposit item not found." }, 404);
      }
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid request body." }, 400);
      const input: Partial<DepositItemInput> = {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.quantity !== undefined && { quantity: Number(body.quantity) }),
        ...(body.unitAmountDollars !== undefined && { unitAmountDollars: Number(body.unitAmountDollars) }),
        ...(body.currency !== undefined && { currency: body.currency }),
        ...(body.refundable !== undefined && { refundable: Boolean(body.refundable) }),
        ...(body.notes !== undefined && { notes: body.notes }),
      };
      return updateDepositItem(env, actor, item, input);
    },

    async deleteItem(env: Env, actor: SessionUser, itemId: string): Promise<Response> {
      const item = await getItemById(env, itemId);
      if (!item || !(await verifyLease(env, actor, item.lease_id))) {
        return json({ error: "Deposit item not found." }, 404);
      }
      return deleteDepositItem(env, actor, item);
    },

    async finalize(env: Env, actor: SessionUser, leaseId: string): Promise<Response> {
      if (!(await verifyLease(env, actor, leaseId))) return json({ error: "Lease not found." }, 404);
      return finalizeDeposit(env, actor, leaseId);
    },

    async recordPayment(request: Request, env: Env, actor: SessionUser, itemId: string): Promise<Response> {
      const item = await getItemById(env, itemId);
      if (!item || !(await verifyLease(env, actor, item.lease_id))) {
        return json({ error: "Deposit item not found." }, 404);
      }
      const form = await request.formData().catch(() => null);
      if (!form) return json({ error: "Invalid form data." }, 400);
      const input: DepositPaymentInput = {
        amountDollars: Number(form.get("amount")),
        paidAt: String(form.get("paidAt") || ""),
        method: form.get("method") ? String(form.get("method")) : null,
      };
      const receipt = form.get("receipt");
      return recordDepositPayment(env, actor, item, input, receipt instanceof File ? receipt : null);
    },

    async createDeductionRoute(request: Request, env: Env, actor: SessionUser, leaseId: string): Promise<Response> {
      if (!(await verifyLease(env, actor, leaseId))) return json({ error: "Lease not found." }, 404);
      const form = await request.formData().catch(() => null);
      if (!form) return json({ error: "Invalid form data." }, 400);
      const input: DeductionInput = {
        name: String(form.get("name") || ""),
        amountDollars: Number(form.get("amount")),
        reason: String(form.get("reason") || ""),
        description: form.get("description") ? String(form.get("description")) : null,
        depositItemId: form.get("depositItemId") ? String(form.get("depositItemId")) : null,
        date: String(form.get("date") || ""),
      };
      const receipt = form.get("receipt");
      return createDeduction(env, actor, leaseId, input, receipt instanceof File ? receipt : null);
    },

    async deleteDeductionRoute(env: Env, actor: SessionUser, deductionId: string): Promise<Response> {
      const deduction = await getDeductionById(env, deductionId);
      if (!deduction || !(await verifyLease(env, actor, deduction.lease_id))) {
        return json({ error: "Deduction not found." }, 404);
      }
      return deleteDeduction(env, actor, deduction);
    },

    async recordReturnRoute(request: Request, env: Env, actor: SessionUser, leaseId: string): Promise<Response> {
      if (!(await verifyLease(env, actor, leaseId))) return json({ error: "Lease not found." }, 404);
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid request body." }, 400);
      const input: ReturnInput = {
        amountDollars: Number(body.amountDollars),
        returnedAt: String(body.returnedAt || ""),
        notes: body.notes ?? null,
      };
      return recordReturn(env, actor, leaseId, input);
    },

    async getDeductionReceipt(env: Env, actor: SessionUser, deductionId: string): Promise<Response> {
      const deduction = await getDeductionById(env, deductionId);
      if (!deduction || !(await verifyLease(env, actor, deduction.lease_id))) {
        return new Response("Not found.", { status: 404 });
      }
      return streamDepositReceipt(env, deduction.receipt_key);
    },

    async getPaymentReceipt(env: Env, actor: SessionUser, paymentId: string): Promise<Response> {
      const payment = await getPaymentById(env, paymentId);
      if (!payment) return new Response("Not found.", { status: 404 });
      const item = await getItemById(env, payment.deposit_item_id);
      if (!item || !(await verifyLease(env, actor, item.lease_id))) {
        return new Response("Not found.", { status: 404 });
      }
      return streamDepositReceipt(env, payment.receipt_key);
    },
  };
}
