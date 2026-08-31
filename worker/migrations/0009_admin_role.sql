-- Adds an internal ADMIN role. Admins are not property owners — they exist
-- solely for account administration (password resets, enable/disable).
-- Password reset deliberately reuses the existing `invitations` table
-- rather than introducing a second token mechanism: a reset is just a
-- fresh invitation issued to an *existing* user, and the existing
-- /api/auth/activate/:token endpoint already sets password_hash + status
-- for whatever user_id the token points to, so it works for both "first
-- activation" and "password reset" without any new activation logic.

PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'OWNER', 'AGENT', 'UNIT_LEADER', 'TENANT')),
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'WAITING_FOR_ACTIVATION', 'INACTIVE')),
  created_by TEXT REFERENCES users(id),
  unit_id TEXT REFERENCES units(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, email, name, phone, role, password_hash, status, created_by, unit_id, created_at)
SELECT id, email, name, phone, role, password_hash, status, created_by, unit_id, created_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

PRAGMA foreign_keys = ON;
