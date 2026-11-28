-- Permit immutable audit events for edits to published competitions.
-- Preserve all existing resource audit history during the table rebuild.
DROP TRIGGER IF EXISTS prevent_admin_resource_audit_update;
DROP TRIGGER IF EXISTS prevent_admin_resource_audit_delete;

ALTER TABLE admin_resource_audit RENAME TO admin_resource_audit_legacy;

CREATE TABLE admin_resource_audit (
  id TEXT PRIMARY KEY NOT NULL,
  resource_type TEXT NOT NULL
    CHECK (resource_type IN ('dataset', 'competition')),
  resource_id TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  action TEXT NOT NULL
    CHECK (action IN (
      'delete_requested',
      'delete_failed',
      'deleted',
      'archived',
      'updated'
    )),
  reason TEXT NOT NULL
    CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  admin_email TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO admin_resource_audit (
  id, resource_type, resource_id, resource_name,
  action, reason, admin_email, created_at
)
SELECT
  id, resource_type, resource_id, resource_name,
  action, reason, admin_email, created_at
FROM admin_resource_audit_legacy;

DROP TABLE admin_resource_audit_legacy;

CREATE INDEX idx_admin_resource_audit_resource
  ON admin_resource_audit(resource_type, resource_id, created_at DESC);

CREATE INDEX idx_admin_resource_audit_admin
  ON admin_resource_audit(admin_email, created_at DESC);

CREATE TRIGGER prevent_admin_resource_audit_update
BEFORE UPDATE ON admin_resource_audit
BEGIN
  SELECT RAISE(ABORT, 'Administrative resource audit history is immutable');
END;

CREATE TRIGGER prevent_admin_resource_audit_delete
BEFORE DELETE ON admin_resource_audit
BEGIN
  SELECT RAISE(ABORT, 'Administrative resource audit history cannot be deleted');
END;
