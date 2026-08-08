ALTER TABLE meetings
ADD COLUMN time_precision TEXT NOT NULL DEFAULT 'datetime'
CHECK (time_precision IN ('date', 'datetime'));

ALTER TABLE user_preferences
ADD COLUMN workspace_organization TEXT NOT NULL DEFAULT 'classic'
CHECK (workspace_organization IN ('classic', 'projects'));

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_hold', 'completed')),
  archived_at TEXT,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meeting_projects (
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (meeting_id, project_id)
);

CREATE TABLE IF NOT EXISTS meeting_note_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'note'
    CHECK (note_type IN ('note', 'decision', 'question', 'action')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meeting_note_block_projects (
  note_block_id INTEGER NOT NULL REFERENCES meeting_note_blocks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (note_block_id, project_id)
);

CREATE TABLE IF NOT EXISTS task_projects (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, project_id)
);

CREATE TABLE IF NOT EXISTS decision_projects (
  decision_id INTEGER NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (decision_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_projects_team_status
ON projects(team_id, status, archived_at, name);

CREATE INDEX IF NOT EXISTS idx_meeting_projects_project
ON meeting_projects(project_id, meeting_id);

CREATE INDEX IF NOT EXISTS idx_meeting_note_blocks_meeting
ON meeting_note_blocks(meeting_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_meeting_note_block_projects_project
ON meeting_note_block_projects(project_id, note_block_id);

CREATE INDEX IF NOT EXISTS idx_task_projects_project
ON task_projects(project_id, task_id);

CREATE INDEX IF NOT EXISTS idx_decision_projects_project
ON decision_projects(project_id, decision_id);
