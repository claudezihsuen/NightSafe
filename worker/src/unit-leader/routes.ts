import type { Env, SessionUser } from "../types";
import { streamUtilityReceipt } from "../shared/utility-review";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface AssignedUnit {
  id: string;
  label: string;
  property_id: string;
  property_name: string;
  property_address: string;
}

async function getAssignedUnit(env: Env, actor: SessionUser): Promise<AssignedUnit | null> {
  if (!actor.unitId) return null;
  const row = await env.DB.prepare(
    `SELECT units.id, units.label, properties.id AS property_id,
            properties.name AS property_name, properties.address AS property_address
     FROM units
     JOIN properties ON properties.id = units.property_id
     WHERE units.id = ?`,
  )
    .bind(actor.unitId)
    .first<AssignedUnit>();
  return row ?? null;
}

/** GET /api/unit-leader/unit */
export async function getMyUnit(env: Env, actor: SessionUser): Promise<Response> {
  const unit = await getAssignedUnit(env, actor);
  if (!unit) return json({ error: "You aren't assigned to a unit yet." }, 404);
  return json({ unit });
}

interface UtilityRow {
  id: string;
  unit_id: string;
  type: "WATER" | "ELECTRICITY";
  month: string;
  amount: number;
  status: "WAITING_PAYMENT" | "PENDING_REVIEW" | "PAYMENT_CONFIRMED";
  receipt_key: string | null;
  submitted_at: string | null;
  payment_date: string | null;
}

/** GET /api/unit-leader/utilities — every water/electricity record for this Unit Leader's unit. */
export async function listUtilities(env: Env, actor: SessionUser): Promise<Response> {
  if (!actor.unitId) return json({ utilities: [] });

  const { results } = await env.DB.prepare(
    `SELECT id, unit_id, type, month, amount, status, receipt_key, submitted_at, payment_date
     FROM utility_payments WHERE unit_id = ? ORDER BY month DESC, type ASC`,
  )
    .bind(actor.unitId)
    .all<UtilityRow>();

  return json({ utilities: results ?? [] });
}

async function getOwnUtility(env: Env, actor: SessionUser, utilityId: string): Promise<UtilityRow | null> {
  if (!actor.unitId) return null;
  const row = await env.DB.prepare(
    `SELECT id, unit_id, type, month, amount, status, receipt_key, submitted_at, payment_date
     FROM utility_payments WHERE id = ? AND unit_id = ?`,
  )
    .bind(utilityId, actor.unitId)
    .first<UtilityRow>();
  return row ?? null;
}

/** GET /api/unit-leader/utilities/:id/receipt */
export async function getUtilityReceipt(env: Env, actor: SessionUser, utilityId: string): Promise<Response> {
  const utility = await getOwnUtility(env, actor, utilityId);
  if (!utility) return new Response("Not found.", { status: 404 });
  return streamUtilityReceipt(env, utility);
}

/**
 * POST /api/unit-leader/utilities/submit (multipart/form-data)
 * Fields: type ('WATER'|'ELECTRICITY'), month ('YYYY-MM'), amount, receipt (file).
 * Water and Electricity are always separate records — never combined, even
 * for the same month.
 */
export async function submitUtility(request: Request, env: Env, actor: SessionUser): Promise<Response> {
  if (!actor.unitId) {
    return json({ error: "You aren't assigned to a unit yet." }, 403);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Invalid form data." }, 400);

  const type = form.get("type");
  const month = typeof form.get("month") === "string" ? String(form.get("month")).trim() : "";
  const amountDollars = Number(form.get("amount"));
  const receipt = form.get("receipt");

  if (type !== "WATER" && type !== "ELECTRICITY") {
    return json({ error: "Type must be WATER or ELECTRICITY." }, 400);
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return json({ error: "Month must be in YYYY-MM format." }, 400);
  }
  if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
    return json({ error: "Amount must be a positive number." }, 400);
  }
  if (!(receipt instanceof File) || receipt.size === 0) {
    return json({ error: "A receipt file is required." }, 400);
  }

  const existing = await env.DB.prepare(
    "SELECT id, status FROM utility_payments WHERE unit_id = ? AND type = ? AND month = ?",
  )
    .bind(actor.unitId, type, month)
    .first<{ id: string; status: string }>();

  if (existing && existing.status !== "WAITING_PAYMENT") {
    return json({ error: `This month's ${type.toLowerCase()} payment isn't awaiting submission.` }, 409);
  }

  const amountCents = Math.round(amountDollars * 100);
  const now = new Date().toISOString();
  const receiptKey = `utilities/${actor.unitId}/${type}/${month}-${Date.now()}-${receipt.name}`;

  await env.FILES.put(receiptKey, await receipt.arrayBuffer(), {
    httpMetadata: { contentType: receipt.type || "application/octet-stream" },
  });

  let utilityId: string;

  if (existing) {
    utilityId = existing.id;
    await env.DB.prepare(
      `UPDATE utility_payments
       SET status = 'PENDING_REVIEW', amount = ?, receipt_key = ?, submitted_at = ?
       WHERE id = ?`,
    )
      .bind(amountCents, receiptKey, now, utilityId)
      .run();
  } else {
    utilityId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO utility_payments (id, unit_id, type, month, amount, status, receipt_key, submitted_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING_REVIEW', ?, ?)`,
    )
      .bind(utilityId, actor.unitId, type, month, amountCents, receiptKey, now)
      .run();
  }

  return json(
    {
      utility: {
        id: utilityId,
        unit_id: actor.unitId,
        type,
        month,
        amount: amountCents,
        status: "PENDING_REVIEW",
        receipt_key: receiptKey,
        submitted_at: now,
      },
    },
    existing ? 200 : 201,
  );
}
