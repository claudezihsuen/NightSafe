-- NightSafe standards-based Web Push support.
-- Existing notifications are marked as already handled so enabling push does
-- not replay historical alerts to users after this migration is deployed.

ALTER TABLE notifications ADD COLUMN push_sent_at TEXT;
ALTER TABLE notifications ADD COLUMN push_attempts INTEGER NOT NULL DEFAULT 0;
UPDATE notifications SET push_sent_at = COALESCE(created_at, datetime('now')) WHERE push_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_push_pending
  ON notifications(push_sent_at, push_attempts, user_id, created_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT,
  auth TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id, updated_at DESC);

-- The VAPID signing key is generated inside the Worker on first use and kept
-- server-side in D1. The public half is exposed to authenticated clients.
CREATE TABLE IF NOT EXISTS push_vapid_keys (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  public_key TEXT NOT NULL,
  private_jwk TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cache VAPID JWTs by push-service origin. Apple recommends not refreshing a
-- JWT more often than hourly, so NightSafe reuses each token for most of its
-- 12-hour lifetime.
CREATE TABLE IF NOT EXISTS push_vapid_tokens (
  audience TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
