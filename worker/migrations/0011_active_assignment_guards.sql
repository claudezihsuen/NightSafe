-- Product-level invariants that were previously enforced only by pre-insert
-- application checks. Partial unique indexes close race conditions between
-- concurrent requests without rebuilding any existing table.

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_lease_per_unit
  ON leases(unit_id)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_live_unit_leader_per_unit
  ON users(unit_id)
  WHERE role = 'UNIT_LEADER'
    AND status != 'INACTIVE'
    AND unit_id IS NOT NULL;
