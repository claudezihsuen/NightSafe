-- NightSafe Documentation + lifecycle foundation.
-- Keeps the legacy agreements table for backward compatibility while the
-- product moves to the broader private Documentation model.

ALTER TABLE notifications ADD COLUMN type TEXT;
ALTER TABLE notifications ADD COLUMN related_type TEXT;
ALTER TABLE notifications ADD COLUMN related_id TEXT;
ALTER TABLE notifications ADD COLUMN href TEXT;
ALTER TABLE notifications ADD COLUMN dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE leases ADD COLUMN move_out_date TEXT;
ALTER TABLE leases ADD COLUMN end_reason TEXT;
ALTER TABLE leases ADD COLUMN final_notes TEXT;
ALTER TABLE leases ADD COLUMN ended_at TEXT;

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  unit_id TEXT REFERENCES units(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  internal_notes TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  object_key TEXT,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'NOT_UPLOADED'
    CHECK (status IN (
      'REQUIRED','NOT_UPLOADED','UPLOADED','UNDER_REVIEW','APPROVED',
      'REJECTED','EXPIRED','ARCHIVED','IN_PROGRESS','COMPLETED','REVISION_REQUIRED'
    )),
  tenant_visible INTEGER NOT NULL DEFAULT 1 CHECK (tenant_visible IN (0,1)),
  tenant_download INTEGER NOT NULL DEFAULT 1 CHECK (tenant_download IN (0,1)),
  tenant_upload INTEGER NOT NULL DEFAULT 0 CHECK (tenant_upload IN (0,1)),
  tenant_can_edit INTEGER NOT NULL DEFAULT 0 CHECK (tenant_can_edit IN (0,1)),
  tenant_can_sign INTEGER NOT NULL DEFAULT 0 CHECK (tenant_can_sign IN (0,1)),
  required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0,1)),
  expiry_date TEXT,
  allowed_types TEXT NOT NULL DEFAULT '["application/pdf","image/png","image/jpeg"]',
  max_file_size INTEGER NOT NULL DEFAULT 10485760,
  current_version INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_lease ON documents(lease_id);
CREATE INDEX IF NOT EXISTS idx_documents_property ON documents(property_id);
CREATE INDEX IF NOT EXISTS idx_documents_unit ON documents(unit_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  object_key TEXT,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'OWNER',
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT,
  UNIQUE(document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions(document_id, version_number DESC);

CREATE TABLE IF NOT EXISTS document_fields (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('TEXT','DATE','SIGNATURE','CHECKBOX','INITIALS')),
  label TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0,1)),
  assigned_role TEXT NOT NULL DEFAULT 'TENANT' CHECK (assigned_role IN ('TENANT')),
  page_number INTEGER NOT NULL DEFAULT 1,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_document_fields_document ON document_fields(document_id, version_number, sort_order);

CREATE TABLE IF NOT EXISTS document_field_values (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES document_fields(id) ON DELETE CASCADE,
  value_text TEXT,
  value_checked INTEGER CHECK (value_checked IN (0,1)),
  signature_key TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(document_id, version_number, tenant_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_document_values_document ON document_field_values(document_id, version_number, tenant_id);

CREATE TABLE IF NOT EXISTS document_submissions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('COMPLETED','REVISION_REQUIRED')),
  values_json TEXT NOT NULL,
  completed_at TEXT,
  completed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reopened_at TEXT,
  reopened_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reopen_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_document_submissions_document ON document_submissions(document_id, version_number DESC);

CREATE TABLE IF NOT EXISTS document_events (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_document_events_document ON document_events(document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS retention_settings (
  owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  retention_months INTEGER NOT NULL DEFAULT 12 CHECK (retention_months BETWEEN 1 AND 60),
  last_cleanup_at TEXT,
  last_records_cleaned INTEGER NOT NULL DEFAULT 0,
  storage_cleanup_status TEXT NOT NULL DEFAULT 'NOT_RUN',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Migrate existing Rental Agreement metadata into Documentation once. Files
-- stay in their existing private R2 locations; no binary data is copied to D1.
INSERT OR IGNORE INTO documents (
  id, tenant_id, lease_id, property_id, unit_id, name, category, description,
  file_name, object_key, uploaded_by, uploaded_at, updated_at, status,
  tenant_visible, tenant_download, tenant_upload, required, current_version, created_at
)
SELECT
  a.id,
  a.tenant_id,
  a.lease_id,
  p.id,
  u.id,
  'Rental Agreement',
  'Rental',
  'Rental agreement',
  a.file_name,
  a.file_key,
  a.uploaded_by,
  a.uploaded_at,
  a.uploaded_at,
  'UPLOADED',
  1,
  1,
  0,
  0,
  1,
  a.uploaded_at
FROM agreements a
JOIN leases l ON l.id = a.lease_id
JOIN units u ON u.id = l.unit_id
JOIN properties p ON p.id = u.property_id
WHERE a.lease_id IS NOT NULL;

INSERT OR IGNORE INTO document_versions (
  id, document_id, version_number, file_name, object_key, uploaded_by, source, uploaded_at
)
SELECT
  'legacy-' || a.id,
  a.id,
  1,
  a.file_name,
  a.file_key,
  a.uploaded_by,
  'LEGACY_AGREEMENT',
  a.uploaded_at
FROM agreements a
JOIN documents d ON d.id = a.id;
