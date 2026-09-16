-- Product-level invariant that was previously enforced only by a pre-insert
-- application check. The partial unique index closes concurrent tenant-
-- creation races without rebuilding any existing table.

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_lease_per_unit
  ON leases(unit_id)
  WHERE status = 'ACTIVE';
