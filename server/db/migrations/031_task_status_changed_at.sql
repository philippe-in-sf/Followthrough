ALTER TABLE tasks
ADD COLUMN status_changed_at TEXT;

UPDATE tasks
SET status_changed_at = updated_at
WHERE status_changed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_auto_archive
ON tasks(archived_at, status, status_changed_at);
