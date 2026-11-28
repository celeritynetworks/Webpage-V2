import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('competition update audit migration preserves history and permits updated action', () => {
  const sql = readFileSync(new URL('../migrations/0013_competition_update_audit.sql', import.meta.url), 'utf8');
  assert.match(sql, /ALTER TABLE admin_resource_audit RENAME TO admin_resource_audit_legacy/i);
  assert.match(sql, /SELECT\s+id, resource_type, resource_id, resource_name,\s+action, reason, admin_email, created_at\s+FROM admin_resource_audit_legacy/i);
  assert.match(sql, /'updated'/);
  assert.match(sql, /prevent_admin_resource_audit_update/);
  assert.match(sql, /prevent_admin_resource_audit_delete/);
});
