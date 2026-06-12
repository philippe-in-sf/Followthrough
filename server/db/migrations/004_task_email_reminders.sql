ALTER TABLE tasks
ADD COLUMN reminder_mode TEXT NOT NULL DEFAULT 'automatic'
CHECK (reminder_mode IN ('automatic', 'manual'));

CREATE TABLE IF NOT EXISTS task_reminder_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('automatic', 'manual')),
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_reminder_events_task_mode_sent
ON task_reminder_events(task_id, mode, sent_at);
