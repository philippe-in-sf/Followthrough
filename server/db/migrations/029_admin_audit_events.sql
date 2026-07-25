-- Security/admin audit trail for privileged actions (impersonation, role
-- changes, admin-initiated password resets). Kept separate from the per-entity
-- audit_events table because these are queried chronologically by admins
-- rather than per record, mirroring the existing user_login_events table.
--
-- Actor and target emails are snapshotted as TEXT so the record remains
-- meaningful even after the referenced user is deleted; the foreign keys use
-- ON DELETE SET NULL rather than CASCADE so the audit row is never removed.

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN (
      'impersonation.start',
      'impersonation.stop',
      'user.role_changed',
      'user.password_reset'
    )
  ),
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_email TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_events_team_created
  ON admin_audit_events(team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_events_target
  ON admin_audit_events(target_user_id, created_at DESC);
