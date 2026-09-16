-- `primary_admins.user_id` prevents duplicate markers for one user, but it
-- does not by itself prevent marking two different users as primary. This
-- trigger makes the table a true singleton without rebuilding any table.

CREATE TRIGGER IF NOT EXISTS trg_single_primary_admin
BEFORE INSERT ON primary_admins
WHEN EXISTS (SELECT 1 FROM primary_admins LIMIT 1)
BEGIN
  SELECT RAISE(ABORT, 'primary_admin_already_exists');
END;
