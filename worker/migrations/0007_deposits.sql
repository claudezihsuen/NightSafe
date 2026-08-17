-- Rental deposit management. Deliberately separate from rent_payments and
-- utility_payments — no shared table, no shared columns. A lease's deposit
-- is composed of any number of line items (type is free text so custom
-- deposit types need no schema/code change). deposit_finalized_at on the
-- lease locks item composition; payments/deductions/returns stay
-- recordable after finalization. Status fields (payment/refund status) are
-- deliberately NOT stored — the API computes them from these records so
-- they can never drift out of sync with the underlying numbers.

ALTER TABLE leases ADD COLUMN deposit_finalized_at TEXT;

CREATE TABLE IF NOT EXISTS deposit_items (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,               -- e.g. "Rental Deposit", "Water Deposit"
  type TEXT NOT NULL,               -- free text; custom types need no code change
  description TEXT,
  quantity REAL NOT NULL DEFAULT 1, -- e.g. 2 (months)
  unit_amount INTEGER NOT NULL,     -- cents
  total_amount INTEGER NOT NULL,    -- cents
  currency TEXT NOT NULL DEFAULT 'MYR',
  refundable INTEGER NOT NULL DEFAULT 1 CHECK (refundable IN (0, 1)),
  notes TEXT,                       -- Owner/Agent-only; never returned to the tenant
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deposit_items_lease_id ON deposit_items(lease_id);

-- A deposit item can be paid in installments.
CREATE TABLE IF NOT EXISTS deposit_payments (
  id TEXT PRIMARY KEY,
  deposit_item_id TEXT NOT NULL REFERENCES deposit_items(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,          -- cents
  paid_at TEXT NOT NULL,
  method TEXT,
  receipt_key TEXT,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deposit_payments_item_id ON deposit_payments(deposit_item_id);

-- Move-out deductions. May reference a specific item, or be lease-level.
CREATE TABLE IF NOT EXISTS deposit_deductions (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  deposit_item_id TEXT REFERENCES deposit_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL,          -- cents
  reason TEXT NOT NULL,
  description TEXT,
  receipt_key TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deposit_deductions_lease_id ON deposit_deductions(lease_id);

-- Refund payments actually returned to the tenant.
CREATE TABLE IF NOT EXISTS deposit_returns (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,          -- cents
  returned_at TEXT NOT NULL,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deposit_returns_lease_id ON deposit_returns(lease_id);
