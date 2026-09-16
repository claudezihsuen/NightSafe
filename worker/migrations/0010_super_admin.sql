-- Adds a single Primary Admin marker without rebuilding the users table.
-- The primary administrator remains an ADMIN in users.role so existing
-- foreign keys and the users role CHECK constraint stay untouched. The Worker
-- exposes that account as SUPER_ADMIN at runtime.

CREATE TABLE IF NOT EXISTS primary_admins (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  singleton INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK (singleton = 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
