ALTER TABLE tasks
ADD COLUMN blockers TEXT NOT NULL DEFAULT '';

ALTER TABLE tasks
ADD COLUMN blockers_cleared_at TEXT;

ALTER TABLE meetings
ADD COLUMN blockers TEXT NOT NULL DEFAULT '';

ALTER TABLE meetings
ADD COLUMN blockers_cleared_at TEXT;
