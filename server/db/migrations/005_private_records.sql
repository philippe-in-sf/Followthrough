ALTER TABLE tasks
ADD COLUMN private INTEGER NOT NULL DEFAULT 0
CHECK (private IN (0, 1));

ALTER TABLE tasks
ADD COLUMN created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE meetings
ADD COLUMN private INTEGER NOT NULL DEFAULT 0
CHECK (private IN (0, 1));

ALTER TABLE meetings
ADD COLUMN created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_private_creator
ON tasks(private, created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_meetings_private_creator
ON meetings(private, created_by_user_id);
