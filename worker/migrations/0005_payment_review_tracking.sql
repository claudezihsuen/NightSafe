-- Agent payment review needs to record who reviewed a payment and in what
-- capacity, distinct from payment_date (when the tenant actually paid).
-- reviewed_by (added in 0002) already serves as reviewer_id.

ALTER TABLE rent_payments ADD COLUMN reviewed_at TEXT;
ALTER TABLE rent_payments ADD COLUMN reviewer_role TEXT CHECK (reviewer_role IN ('OWNER', 'AGENT'));
