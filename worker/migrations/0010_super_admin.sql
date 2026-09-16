-- Adds a single higher-privilege SUPER_ADMIN role used for NightSafe's
-- primary administrator. SUPER_ADMIN has the normal admin capabilities plus
-- the ability to invite/create additional ADMIN accounts. No UI/API creates
-- another SUPER_ADMIN.

PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'OWNER', 'AGENT', 'UNIT_LEADER', 'TENANT')),
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

-- A partial unique index makes it impossible to accidentally create a second
-- primary administrator even through direct SQL.
CREATE UNIQUE INDEX idx_single_super_admin ON users(role) WHERE role = 'SUPER_ADMIN';

PRAGMA foreign_keys = ON;
