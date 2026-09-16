-- Lightweight application-level login throttling. Keys are SHA-256 hashes of
-- the client IP + normalized email, so raw login identifiers are not stored.

CREATE TABLE IF NOT EXISTS login_rate_limits (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_rate_limits_updated_at
  ON login_rate_limits(updated_at);
