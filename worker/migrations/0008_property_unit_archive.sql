-- Safe delete for properties/units. Hard DELETE cascades (via existing
-- ON DELETE CASCADE FKs) through units -> leases -> rent_payments/
-- deposit_items/etc, which would silently destroy financial history. So a
-- hard delete is only allowed when zero dependent rows exist; otherwise
-- the Owner archives instead. Archived rows are excluded from pickers
-- (tenant/unit-leader creation, agent assignment) but never deleted.

ALTER TABLE properties ADD COLUMN archived_at TEXT;
ALTER TABLE units ADD COLUMN archived_at TEXT;
