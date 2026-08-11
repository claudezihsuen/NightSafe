-- NightSafe core schema: properties, units, leases, payments, agreements,
-- notifications, audit log. Builds on the users table from 0001_auth.sql.
--
-- Kept deliberately simple: no soft-delete columns, no multi-currency, no
-- versioning. IDs are TEXT (crypto.randomUUID(), matching users.id).

-- A property belongs to exactly one Owner. Agents get access via
-- agent_assignments below, not by owning the row.
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_properties_owner_id ON properties(owner_id);

-- Property → Units.
CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  label TEXT NOT NULL,              -- e.g. "2B"
  monthly_rent INTEGER NOT NULL,    -- smallest currency unit (cents)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_units_property_id ON units(property_id);

-- Agent → assigned properties/units. An assignment is scoped to either a
-- whole property or a single unit within it (unit_id is NULL for a
-- property-wide assignment).
CREATE TABLE IF NOT EXISTS agent_assignments (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_assignments_agent_id ON agent_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_assignments_property_id ON agent_assignments(property_id);
CREATE INDEX IF NOT EXISTS idx_agent_assignments_unit_id ON agent_assignments(unit_id);

-- Unit → Tenants, through a lease. Lease → Tenant + Unit.
-- is_unit_leader marks the tenant on this lease as the unit's utility
-- contact (Owner/Agent can assign this per the product spec).
CREATE TABLE IF NOT EXISTS leases (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  monthly_rent INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_unit_leader INTEGER NOT NULL DEFAULT 0 CHECK (is_unit_leader IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leases_unit_id ON leases(unit_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant_id ON leases(tenant_id);

-- Rent payment → Lease + month. One row per lease per month.
CREATE TABLE IF NOT EXISTS rent_payments (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  month TEXT NOT NULL,              -- 'YYYY-MM'
  amount INTEGER NOT NULL,          -- cents
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'WAITING_PAYMENT'
    CHECK (status IN ('WAITING_PAYMENT', 'PENDING_REVIEW', 'PAYMENT_CONFIRMED')),
  receipt_key TEXT,                 -- R2 object key, set once uploaded
  submitted_at TEXT,
  payment_date TEXT,
  reviewed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (lease_id, month)
);

CREATE INDEX IF NOT EXISTS idx_rent_payments_lease_id ON rent_payments(lease_id);
CREATE INDEX IF NOT EXISTS idx_rent_payments_status ON rent_payments(status);

-- Utility payment → Unit + month + type. Water and electricity are
-- separate rows even for the same unit/month.
CREATE TABLE IF NOT EXISTS utility_payments (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('WATER', 'ELECTRICITY')),
  month TEXT NOT NULL,              -- 'YYYY-MM'
  amount INTEGER NOT NULL,          -- cents
  status TEXT NOT NULL DEFAULT 'WAITING_PAYMENT'
    CHECK (status IN ('WAITING_PAYMENT', 'PENDING_REVIEW', 'PAYMENT_CONFIRMED')),
  receipt_key TEXT,
  submitted_at TEXT,
  payment_date TEXT,
  reviewed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (unit_id, type, month)
);

CREATE INDEX IF NOT EXISTS idx_utility_payments_unit_id ON utility_payments(unit_id);
CREATE INDEX IF NOT EXISTS idx_utility_payments_status ON utility_payments(status);

-- Agreement → Tenant.
CREATE TABLE IF NOT EXISTS agreements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lease_id TEXT REFERENCES leases(id) ON DELETE SET NULL,
  file_key TEXT NOT NULL,           -- R2 object key
  file_name TEXT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agreements_tenant_id ON agreements(tenant_id);

-- Notification → User.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- Audit log → User + action. user_id is nullable for system-initiated
-- actions that have no acting user.
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,             -- e.g. 'RENT_PAYMENT_CONFIRMED'
  entity_type TEXT,                 -- e.g. 'rent_payment'
  entity_id TEXT,
  metadata TEXT,                    -- JSON string, kept opaque at the DB layer
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
