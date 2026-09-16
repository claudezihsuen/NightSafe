-- Defense-in-depth constraints for the Documentation Field Builder.
-- The API validates these values already; these triggers prevent malformed
-- layouts from being written through any future route or maintenance script.

CREATE TRIGGER IF NOT EXISTS document_fields_validate_insert
BEFORE INSERT ON document_fields
BEGIN
  SELECT CASE
    WHEN NEW.version_number < 1 THEN RAISE(ABORT, 'document field version must be positive')
    WHEN NEW.page_number < 1 OR NEW.page_number > 999 THEN RAISE(ABORT, 'document field page is invalid')
    WHEN length(trim(NEW.label)) < 1 OR length(trim(NEW.label)) > 160 THEN RAISE(ABORT, 'document field label is invalid')
    WHEN NEW.assigned_role <> 'TENANT' THEN RAISE(ABORT, 'document field assignment is invalid')
    WHEN NEW.x < 0 OR NEW.y < 0 OR NEW.width <= 0 OR NEW.height <= 0 THEN RAISE(ABORT, 'document field bounds are invalid')
    WHEN NEW.x + NEW.width > 1.001 OR NEW.y + NEW.height > 1.001 THEN RAISE(ABORT, 'document field is outside the page')
  END;
END;

CREATE TRIGGER IF NOT EXISTS document_fields_validate_update
BEFORE UPDATE OF version_number, page_number, label, assigned_role, x, y, width, height ON document_fields
BEGIN
  SELECT CASE
    WHEN NEW.version_number < 1 THEN RAISE(ABORT, 'document field version must be positive')
    WHEN NEW.page_number < 1 OR NEW.page_number > 999 THEN RAISE(ABORT, 'document field page is invalid')
    WHEN length(trim(NEW.label)) < 1 OR length(trim(NEW.label)) > 160 THEN RAISE(ABORT, 'document field label is invalid')
    WHEN NEW.assigned_role <> 'TENANT' THEN RAISE(ABORT, 'document field assignment is invalid')
    WHEN NEW.x < 0 OR NEW.y < 0 OR NEW.width <= 0 OR NEW.height <= 0 THEN RAISE(ABORT, 'document field bounds are invalid')
    WHEN NEW.x + NEW.width > 1.001 OR NEW.y + NEW.height > 1.001 THEN RAISE(ABORT, 'document field is outside the page')
  END;
END;
