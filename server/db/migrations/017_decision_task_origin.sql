ALTER TABLE tasks
ADD COLUMN origin_decision_id INTEGER REFERENCES decisions(id);

CREATE INDEX IF NOT EXISTS idx_tasks_origin_decision
ON tasks(origin_decision_id);

DROP INDEX IF EXISTS idx_audit_events_entity;

CREATE TABLE audit_events_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('task', 'meeting', 'decision', 'person')),
  entity_public_id TEXT NOT NULL,
  action TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  changes_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO audit_events_next (
  id,
  entity_type,
  entity_public_id,
  action,
  user_id,
  summary,
  changes_json,
  created_at
)
SELECT
  id,
  entity_type,
  entity_public_id,
  action,
  user_id,
  summary,
  changes_json,
  created_at
FROM audit_events;

DROP TABLE audit_events;

ALTER TABLE audit_events_next RENAME TO audit_events;

CREATE INDEX idx_audit_events_entity
ON audit_events(entity_type, entity_public_id, id DESC);
