import type { Env, SessionUser } from "../types";
import { createDocumentRoutes } from "../shared/documents";

const documentRoutes = createDocumentRoutes(async (env: Env, actor: SessionUser, leaseId: string) => {
  const row = await env.DB.prepare(
    `SELECT leases.id FROM leases
     JOIN units ON units.id = leases.unit_id
     JOIN properties ON properties.id = units.property_id
     WHERE leases.id = ? AND properties.owner_id = ?`,
  )
    .bind(leaseId, actor.id)
    .first();
  return Boolean(row);
});

export const listDocuments = documentRoutes.list;
export const uploadDocument = documentRoutes.upload;
export const downloadDocument = documentRoutes.download;
export const deleteDocument = documentRoutes.remove;
