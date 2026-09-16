-- `primary_admins.user_id` prevents duplicate markers for one user, but it
-- does not by itself prevent marking two different users as primary. A unique
-- index on a constant expression makes the marker table a true singleton.

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_primary_admin
  ON primary_admins((1));
