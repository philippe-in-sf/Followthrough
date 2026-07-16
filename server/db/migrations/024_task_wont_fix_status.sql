-- migrate: no-transaction
PRAGMA foreign_keys = OFF;

BEGIN IMMEDIATE;

CREATE TABLE tasks_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  assignee_person_id INTEGER REFERENCES people(id),
  status TEXT NOT NULL CHECK (status IN ('Open', 'In Progress', 'Blocked', 'Done', 'Won''t Fix')),
  due_date TEXT,
  origin_meeting_id INTEGER REFERENCES meetings(id),
  series_id INTEGER REFERENCES meeting_series(id),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reminder_mode TEXT NOT NULL DEFAULT 'manual' CHECK (reminder_mode IN ('automatic', 'manual')),
  private INTEGER NOT NULL DEFAULT 0 CHECK (private IN (0, 1)),
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  blockers TEXT NOT NULL DEFAULT '',
  blockers_cleared_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT,
  origin_decision_id INTEGER REFERENCES decisions(id)
);

INSERT INTO tasks_next (
  id,
  public_id,
  description,
  assignee_person_id,
  status,
  due_date,
  origin_meeting_id,
  series_id,
  archived_at,
  created_at,
  updated_at,
  reminder_mode,
  private,
  created_by_user_id,
  blockers,
  blockers_cleared_at,
  notes,
  team_id,
  origin_decision_id
)
SELECT
  id,
  public_id,
  description,
  assignee_person_id,
  status,
  due_date,
  origin_meeting_id,
  series_id,
  archived_at,
  created_at,
  updated_at,
  reminder_mode,
  private,
  created_by_user_id,
  blockers,
  blockers_cleared_at,
  notes,
  team_id,
  origin_decision_id
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_next RENAME TO tasks;

CREATE INDEX IF NOT EXISTS idx_tasks_public_id ON tasks(public_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_person_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_origin_meeting ON tasks(origin_meeting_id);
CREATE INDEX IF NOT EXISTS idx_tasks_series ON tasks(series_id);
CREATE INDEX IF NOT EXISTS idx_tasks_private_creator ON tasks(private, created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_tasks_origin_decision ON tasks(origin_decision_id);

COMMIT;

PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
