import type { Env, SessionUser } from "../types";
import { streamPrivateAttachment } from "../shared/file-security";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export interface OwnerAgreementRow {
  id: string;
  lease_id: string;
  file_name: string;
  uploaded_at: string;
  tenant_id: string;
  tenant_name: string;
  tenant_email: string;
  property_id: string;
  property_name: string;
  unit_id: string;
  unit_label: string;
}

/** GET /api/owner/agreements — agreements across properties owned by this Owner. */
export async function listOwnerAgreements(env: Env, actor: SessionUser): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT
       agreements.id,
       agreements.lease_id,
       agreements.file_name,
       agreements.uploaded_at,
       tenant.id AS tenant_id,
       tenant.name AS tenant_name,
       tenant.email AS tenant_email,
       properties.id AS property_id,
       properties.name AS property_name,
       units.id AS unit_id,
       units.label AS unit_label
     FROM agreements
     JOIN leases ON leases.id = agreements.lease_id
     JOIN users AS tenant ON tenant.id = leases.tenant_id
     JOIN units ON units.id = leases.unit_id
     JOIN properties ON properties.id = units.property_id
     WHERE properties.owner_id = ?
     ORDER BY agreements.uploaded_at DESC`,
  )
    .bind(actor.id)
    .all<OwnerAgreementRow>();

  return json({ agreements: results ?? [] });
}

/** GET /api/owner/agreements/:id/download — owner-scoped file stream. */
export async function downloadOwnerAgreement(
  env: Env,
  actor: SessionUser,
  agreementId: string,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT agreements.file_key, agreements.file_name
     FROM agreements
     JOIN leases ON leases.id = agreements.lease_id
     JOIN units ON units.id = leases.unit_id
     JOIN properties ON properties.id = units.property_id
     WHERE agreements.id = ? AND properties.owner_id = ?`,
  )
    .bind(agreementId, actor.id)
    .first<{ file_key: string; file_name: string }>();

  if (!row) return new Response("Not found.", { status: 404 });
  return streamPrivateAttachment(env, row.file_key, row.file_name);
}
