-- Whole-property access already includes every unit, so storing both a
-- property-wide assignment and unit-level assignments for the same Agent is
-- redundant and makes permission reasoning harder. Clean historical overlap
-- without changing effective access, then reject future overlap at D1 level.

DELETE FROM agent_assignments AS unit_assignment
WHERE unit_assignment.unit_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM agent_assignments AS whole_property
    WHERE whole_property.agent_id = unit_assignment.agent_id
      AND whole_property.property_id = unit_assignment.property_id
      AND whole_property.unit_id IS NULL
  );

CREATE TRIGGER IF NOT EXISTS trg_agent_assignment_no_overlap_insert
BEFORE INSERT ON agent_assignments
FOR EACH ROW
WHEN
  (
    NEW.unit_id IS NULL
    AND EXISTS (
      SELECT 1 FROM agent_assignments aa
      WHERE aa.agent_id = NEW.agent_id
        AND aa.property_id = NEW.property_id
    )
  )
  OR (
    NEW.unit_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM agent_assignments aa
      WHERE aa.agent_id = NEW.agent_id
        AND aa.property_id = NEW.property_id
        AND aa.unit_id IS NULL
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'Agent assignment overlaps existing property access');
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_assignment_no_overlap_update
BEFORE UPDATE OF agent_id, property_id, unit_id ON agent_assignments
FOR EACH ROW
WHEN
  (
    NEW.unit_id IS NULL
    AND EXISTS (
      SELECT 1 FROM agent_assignments aa
      WHERE aa.id != OLD.id
        AND aa.agent_id = NEW.agent_id
        AND aa.property_id = NEW.property_id
    )
  )
  OR (
    NEW.unit_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM agent_assignments aa
      WHERE aa.id != OLD.id
        AND aa.agent_id = NEW.agent_id
        AND aa.property_id = NEW.property_id
        AND aa.unit_id IS NULL
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'Agent assignment overlaps existing property access');
END;
