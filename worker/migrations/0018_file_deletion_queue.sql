-- Persist private-file deletion work before database rows disappear.
-- R2 deletion is retried by scheduled maintenance until it succeeds.

CREATE TABLE IF NOT EXISTS file_deletion_queue (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_file_deletion_queue_due
  ON file_deletion_queue(next_attempt_at, attempts);

CREATE TRIGGER IF NOT EXISTS queue_rent_receipt_before_delete
BEFORE DELETE ON rent_payments
WHEN OLD.receipt_key IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO file_deletion_queue (id, object_key, reason)
  VALUES (lower(hex(randomblob(16))), OLD.receipt_key, 'rent_receipt');
END;

CREATE TRIGGER IF NOT EXISTS queue_agreement_file_before_delete
BEFORE DELETE ON agreements
WHEN OLD.file_key IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO file_deletion_queue (id, object_key, reason)
  VALUES (lower(hex(randomblob(16))), OLD.file_key, 'agreement');
END;

CREATE TRIGGER IF NOT EXISTS queue_document_file_before_delete
BEFORE DELETE ON documents
WHEN OLD.object_key IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO file_deletion_queue (id, object_key, reason)
  VALUES (lower(hex(randomblob(16))), OLD.object_key, 'document');
END;

CREATE TRIGGER IF NOT EXISTS queue_document_version_file_before_delete
BEFORE DELETE ON document_versions
WHEN OLD.object_key IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO file_deletion_queue (id, object_key, reason)
  VALUES (lower(hex(randomblob(16))), OLD.object_key, 'document_version');
END;

CREATE TRIGGER IF NOT EXISTS queue_signature_file_before_delete
BEFORE DELETE ON document_field_values
WHEN OLD.signature_key IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO file_deletion_queue (id, object_key, reason)
  VALUES (lower(hex(randomblob(16))), OLD.signature_key, 'document_signature');
END;

CREATE TRIGGER IF NOT EXISTS queue_deposit_payment_receipt_before_delete
BEFORE DELETE ON deposit_payments
WHEN OLD.receipt_key IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO file_deletion_queue (id, object_key, reason)
  VALUES (lower(hex(randomblob(16))), OLD.receipt_key, 'deposit_payment_receipt');
END;

CREATE TRIGGER IF NOT EXISTS queue_deposit_deduction_receipt_before_delete
BEFORE DELETE ON deposit_deductions
WHEN OLD.receipt_key IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO file_deletion_queue (id, object_key, reason)
  VALUES (lower(hex(randomblob(16))), OLD.receipt_key, 'deposit_deduction_receipt');
END;
