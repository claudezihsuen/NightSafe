-- Final business invariants that must hold even when the API is bypassed.
-- Existing historical rows are preserved; exact duplicate agent assignments
-- are semantically redundant, so keep one before adding uniqueness guards.

DELETE FROM agent_assignments
WHERE id NOT IN (
  SELECT MIN(id)
  FROM agent_assignments
  GROUP BY agent_id, property_id, IFNULL(unit_id, '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_assignments_unique_property
  ON agent_assignments(agent_id, property_id)
  WHERE unit_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_assignments_unique_unit
  ON agent_assignments(agent_id, property_id, unit_id)
  WHERE unit_id IS NOT NULL;

-- Archived inventory cannot receive new agent assignments.
CREATE TRIGGER IF NOT EXISTS trg_agent_assignment_active_target_insert
BEFORE INSERT ON agent_assignments
FOR EACH ROW
WHEN
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = NEW.property_id AND p.archived_at IS NOT NULL
  )
  OR (
    NEW.unit_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM units u
      WHERE u.id = NEW.unit_id
        AND (u.property_id != NEW.property_id OR u.archived_at IS NOT NULL)
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'Agent assignments require an active property and unit');
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_assignment_active_target_update
BEFORE UPDATE OF property_id, unit_id ON agent_assignments
FOR EACH ROW
WHEN
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = NEW.property_id AND p.archived_at IS NOT NULL
  )
  OR (
    NEW.unit_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM units u
      WHERE u.id = NEW.unit_id
        AND (u.property_id != NEW.property_id OR u.archived_at IS NOT NULL)
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'Agent assignments require an active property and unit');
END;

-- New active leases cannot be attached to archived inventory.
CREATE TRIGGER IF NOT EXISTS trg_active_lease_requires_active_unit_insert
BEFORE INSERT ON leases
FOR EACH ROW
WHEN NEW.status = 'ACTIVE' AND EXISTS (
  SELECT 1
  FROM units u
  JOIN properties p ON p.id = u.property_id
  WHERE u.id = NEW.unit_id
    AND (u.archived_at IS NOT NULL OR p.archived_at IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'Active leases require an active property and unit');
END;

CREATE TRIGGER IF NOT EXISTS trg_active_lease_requires_active_unit_update
BEFORE UPDATE OF unit_id, status ON leases
FOR EACH ROW
WHEN NEW.status = 'ACTIVE' AND EXISTS (
  SELECT 1
  FROM units u
  JOIN properties p ON p.id = u.property_id
  WHERE u.id = NEW.unit_id
    AND (u.archived_at IS NOT NULL OR p.archived_at IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'Active leases require an active property and unit');
END;

-- A non-inactive Unit Leader may hold exactly one unit, and a unit may have
-- at most one non-inactive Unit Leader. Inactive historical leaders do not
-- occupy the slot; attempting to reactivate one into an occupied unit fails.
CREATE TRIGGER IF NOT EXISTS trg_unit_leader_unique_unit_insert
BEFORE INSERT ON users
FOR EACH ROW
WHEN NEW.role = 'UNIT_LEADER'
  AND NEW.status != 'INACTIVE'
  AND NEW.unit_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM users other
    WHERE other.role = 'UNIT_LEADER'
      AND other.status != 'INACTIVE'
      AND other.unit_id = NEW.unit_id
  )
BEGIN
  SELECT RAISE(ABORT, 'This unit already has an active Unit Leader');
END;

CREATE TRIGGER IF NOT EXISTS trg_unit_leader_unique_unit_update
BEFORE UPDATE OF role, status, unit_id ON users
FOR EACH ROW
WHEN NEW.role = 'UNIT_LEADER'
  AND NEW.status != 'INACTIVE'
  AND NEW.unit_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM users other
    WHERE other.id != NEW.id
      AND other.role = 'UNIT_LEADER'
      AND other.status != 'INACTIVE'
      AND other.unit_id = NEW.unit_id
  )
BEGIN
  SELECT RAISE(ABORT, 'This unit already has an active Unit Leader');
END;

CREATE TRIGGER IF NOT EXISTS trg_unit_leader_active_target_insert
BEFORE INSERT ON users
FOR EACH ROW
WHEN NEW.role = 'UNIT_LEADER'
  AND NEW.unit_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM units u
    JOIN properties p ON p.id = u.property_id
    WHERE u.id = NEW.unit_id
      AND (u.archived_at IS NOT NULL OR p.archived_at IS NOT NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'Unit Leaders require an active property and unit');
END;

CREATE TRIGGER IF NOT EXISTS trg_unit_leader_active_target_update
BEFORE UPDATE OF role, unit_id ON users
FOR EACH ROW
WHEN NEW.role = 'UNIT_LEADER'
  AND NEW.unit_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM units u
    JOIN properties p ON p.id = u.property_id
    WHERE u.id = NEW.unit_id
      AND (u.archived_at IS NOT NULL OR p.archived_at IS NOT NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'Unit Leaders require an active property and unit');
END;

-- Deposit line items cannot be overpaid.
CREATE TRIGGER IF NOT EXISTS trg_deposit_payment_no_overpay_insert
BEFORE INSERT ON deposit_payments
FOR EACH ROW
WHEN NEW.amount <= 0 OR NEW.amount + COALESCE((
  SELECT SUM(dp.amount)
  FROM deposit_payments dp
  WHERE dp.deposit_item_id = NEW.deposit_item_id
), 0) > COALESCE((
  SELECT di.total_amount
  FROM deposit_items di
  WHERE di.id = NEW.deposit_item_id
), -1)
BEGIN
  SELECT RAISE(ABORT, 'Deposit payment exceeds the outstanding item amount');
END;

CREATE TRIGGER IF NOT EXISTS trg_deposit_payment_no_overpay_update
BEFORE UPDATE OF amount, deposit_item_id ON deposit_payments
FOR EACH ROW
WHEN NEW.amount <= 0 OR NEW.amount + COALESCE((
  SELECT SUM(dp.amount)
  FROM deposit_payments dp
  WHERE dp.deposit_item_id = NEW.deposit_item_id AND dp.id != OLD.id
), 0) > COALESCE((
  SELECT di.total_amount
  FROM deposit_items di
  WHERE di.id = NEW.deposit_item_id
), -1)
BEGIN
  SELECT RAISE(ABORT, 'Deposit payment exceeds the outstanding item amount');
END;

-- Deductions and returns are funded only by refundable money actually paid.
-- This prevents negative balances and prevents non-refundable charges from
-- being accidentally returned as deposit money.
CREATE TRIGGER IF NOT EXISTS trg_deposit_deduction_within_held_insert
BEFORE INSERT ON deposit_deductions
FOR EACH ROW
WHEN NEW.amount <= 0 OR NEW.amount > (
  COALESCE((
    SELECT SUM(dp.amount)
    FROM deposit_payments dp
    JOIN deposit_items di ON di.id = dp.deposit_item_id
    WHERE di.lease_id = NEW.lease_id AND di.refundable = 1
  ), 0)
  - COALESCE((SELECT SUM(dd.amount) FROM deposit_deductions dd WHERE dd.lease_id = NEW.lease_id), 0)
  - COALESCE((SELECT SUM(dr.amount) FROM deposit_returns dr WHERE dr.lease_id = NEW.lease_id), 0)
)
BEGIN
  SELECT RAISE(ABORT, 'Deposit deduction exceeds refundable money held');
END;

CREATE TRIGGER IF NOT EXISTS trg_deposit_return_within_held_insert
BEFORE INSERT ON deposit_returns
FOR EACH ROW
WHEN NEW.amount <= 0 OR NEW.amount > (
  COALESCE((
    SELECT SUM(dp.amount)
    FROM deposit_payments dp
    JOIN deposit_items di ON di.id = dp.deposit_item_id
    WHERE di.lease_id = NEW.lease_id AND di.refundable = 1
  ), 0)
  - COALESCE((SELECT SUM(dd.amount) FROM deposit_deductions dd WHERE dd.lease_id = NEW.lease_id), 0)
  - COALESCE((SELECT SUM(dr.amount) FROM deposit_returns dr WHERE dr.lease_id = NEW.lease_id), 0)
)
BEGIN
  SELECT RAISE(ABORT, 'Deposit return exceeds refundable money held');
END;
