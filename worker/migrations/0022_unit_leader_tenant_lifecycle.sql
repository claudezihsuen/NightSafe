-- Unit Leader is a tenant capability attached to an active lease.
-- When that lease ends, remove the extra role/unit assignment so the account
-- cannot retain utility access after move-out. The normal lifecycle route
-- decides whether/when the account becomes ACTIVE again for a new tenancy.
CREATE TRIGGER IF NOT EXISTS trg_unit_leader_release_when_lease_ends
AFTER UPDATE OF status ON leases
FOR EACH ROW
WHEN OLD.status = 'ACTIVE'
  AND NEW.status = 'ENDED'
  AND OLD.is_unit_leader = 1
BEGIN
  UPDATE users
  SET role = 'TENANT', unit_id = NULL
  WHERE id = OLD.tenant_id AND role = 'UNIT_LEADER';
END;

-- Keep the lease marker authoritative if a Unit Leader account is removed or
-- demoted by an administrative action outside the normal assignment endpoint.
CREATE TRIGGER IF NOT EXISTS trg_unit_leader_marker_clear_on_user_demotion
AFTER UPDATE OF role, unit_id ON users
FOR EACH ROW
WHEN OLD.role = 'UNIT_LEADER'
  AND (NEW.role != 'UNIT_LEADER' OR NEW.unit_id IS NULL)
BEGIN
  UPDATE leases
  SET is_unit_leader = 0
  WHERE tenant_id = OLD.id AND status = 'ACTIVE';
END;
