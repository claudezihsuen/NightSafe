-- Defense-in-depth constraints for the Documentation Field Builder.
-- Keep the trigger style consistent with the production-proven business
-- invariant migrations so Cloudflare D1 can apply it remotely.

CREATE TRIGGER IF NOT EXISTS document_fields_validate_insert
BEFORE INSERT ON document_fields
FOR EACH ROW
WHEN
  NEW.version_number < 1
  OR NEW.page_number < 1
  OR NEW.page_number > 999
  OR length(trim(NEW.label)) < 1
  OR length(trim(NEW.label)) > 160
  OR NEW.assigned_role <> 'TENANT'
  OR NEW.x < 0
  OR NEW.y < 0
  OR NEW.width <= 0
  OR NEW.height <= 0
  OR NEW.x + NEW.width > 1.001
  OR NEW.y + NEW.height > 1.001
BEGIN
  SELECT RAISE(ABORT, 'Invalid document field configuration');
END;

CREATE TRIGGER IF NOT EXISTS document_fields_validate_update
BEFORE UPDATE OF version_number, page_number, label, assigned_role, x, y, width, height ON document_fields
FOR EACH ROW
WHEN
  NEW.version_number < 1
  OR NEW.page_number < 1
  OR NEW.page_number > 999
  OR length(trim(NEW.label)) < 1
  OR length(trim(NEW.label)) > 160
  OR NEW.assigned_role <> 'TENANT'
  OR NEW.x < 0
  OR NEW.y < 0
  OR NEW.width <= 0
  OR NEW.height <= 0
  OR NEW.x + NEW.width > 1.001
  OR NEW.y + NEW.height > 1.001
BEGIN
  SELECT RAISE(ABORT, 'Invalid document field configuration');
END;
