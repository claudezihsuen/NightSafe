-- Unit Leader utilities: a Unit Leader account is tied to exactly one unit
-- (unit_id, meaningful only when role = 'UNIT_LEADER'), and utility_payments
-- gets the same reviewer tracking rent_payments got in 0005 — kept as
-- separate columns on a separate table, never merged with rent/deposit data.

ALTER TABLE users ADD COLUMN unit_id TEXT REFERENCES units(id);

ALTER TABLE utility_payments ADD COLUMN reviewed_at TEXT;
ALTER TABLE utility_payments ADD COLUMN reviewer_role TEXT CHECK (reviewer_role IN ('OWNER', 'AGENT'));
