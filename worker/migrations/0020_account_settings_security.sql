-- Account preferences, verification, two-factor authentication, and device sessions.
-- Existing emails are treated as verified because existing accounts were already
-- activated through NightSafe's invitation/account-activation flow.

ALTER TABLE users ADD COLUMN nickname TEXT;
ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'EN';
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN phone_verified_at TEXT;
ALTER TABLE users ADD COLUMN two_factor_secret TEXT;
ALTER TABLE users ADD COLUMN two_factor_pending_secret TEXT;
ALTER TABLE users ADD COLUMN two_factor_enabled_at TEXT;

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at)
WHERE email_verified_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_unique_nocase
  ON users(lower(nickname))
  WHERE nickname IS NOT NULL AND trim(nickname) != '';

ALTER TABLE sessions ADD COLUMN device_id TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;
ALTER TABLE sessions ADD COLUMN device_name TEXT;
ALTER TABLE sessions ADD COLUMN country TEXT;
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;

UPDATE sessions
SET device_id = lower(hex(randomblob(16))),
    last_seen_at = COALESCE(last_seen_at, created_at)
WHERE device_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_device_id
  ON sessions(device_id)
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_user_expires
  ON sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS account_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('EMAIL_CHANGE', 'PHONE_CHANGE')),
  target_value TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_account_verifications_user
  ON account_verifications(user_id, purpose, expires_at);

CREATE TABLE IF NOT EXISTS two_factor_login_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_two_factor_login_user
  ON two_factor_login_challenges(user_id, expires_at);
