-- Adds what Owner tenant creation needs: a phone number on users, lease
-- terms (due day, deposit), and renames the "invited but not yet
-- activated" user status to match the product's terminology exactly.

PRAGMA foreign_keys = OFF;

-- SQLite can't ALTER a CHECK constraint in place, so rebuild the table.
CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'AGENT', 'UNIT_LEADER', 'TENANT')),
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'WAITING_FOR_ACTIVATION')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, email, name, role, password_hash, status, created_at)
SELECT id, email, name, role, password_hash,
  CASE status WHEN 'PENDING' THEN 'WAITING_FOR_ACTIVATION' ELSE status END,
  created_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

PRAGMA foreign_keys = ON;

-- Lease terms needed at tenant-creation time.
ALTER TABLE leases ADD COLUMN due_day INTEGER;   -- day of month rent is due, e.g. 5
ALTER TABLE leases ADD COLUMN deposit INTEGER;   -- cents
