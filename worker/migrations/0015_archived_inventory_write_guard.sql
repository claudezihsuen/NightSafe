-- Archived properties remain readable for history, but are closed to new
-- inventory. API checks provide friendly errors; this trigger is the final
-- database-level guard for direct writes.

CREATE TRIGGER IF NOT EXISTS trg_unit_requires_active_property_insert
BEFORE INSERT ON units
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM properties p
  WHERE p.id = NEW.property_id AND p.archived_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'Archived properties cannot receive new units');
END;
