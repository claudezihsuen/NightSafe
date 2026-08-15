-- Adds what Agent management needs: an INACTIVE status Owners can toggle
-- an Agent to/from, and a created_by column so "this Owner's agents" (and
-- tenants) can be queried directly instead of only inferred from leases.

PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'AGENT', 'UNIT_LEADER', 'TENANT')),
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'WAITING_FOR_ACTIVATION', 'INACTIVE')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, email, name, phone, role, password_hash, status, created_at)
SELECT id, email, name, phone, role, password_hash, status, created_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

PRAGMA foreign_keys = ON;
