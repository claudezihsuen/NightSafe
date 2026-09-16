import type { Env } from "../types";

interface QueueRow {
  id: string;
  object_key: string;
  attempts: number;
}

function nextRetry(attempts: number) {
  const minutes = Math.min(24 * 60, Math.max(5, 5 * (2 ** Math.min(attempts, 8))));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function messageFrom(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

/**
 * Deletes a bounded batch of queued private R2 objects. Failed deletions stay
 * queued with exponential backoff, so database cleanup never permanently loses
 * the only reference to a file that still needs to be removed.
 */
export async function processFileDeletionQueue(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, object_key, attempts
     FROM file_deletion_queue
     WHERE next_attempt_at <= datetime('now')
     ORDER BY created_at
     LIMIT 100`,
  ).all<QueueRow>();

  for (const row of results ?? []) {
    try {
      await env.FILES.delete(row.object_key);
      await env.DB.prepare("DELETE FROM file_deletion_queue WHERE id=?").bind(row.id).run();
    } catch (error) {
      const attempts = row.attempts + 1;
      await env.DB.prepare(
        `UPDATE file_deletion_queue
         SET attempts=?, last_error=?, next_attempt_at=?, updated_at=?
         WHERE id=?`,
      ).bind(attempts, messageFrom(error), nextRetry(attempts), new Date().toISOString(), row.id).run();
    }
  }
}
