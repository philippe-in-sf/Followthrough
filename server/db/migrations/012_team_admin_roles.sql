CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  logo_url TEXT,
  work_calendar_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO teams (id, name)
SELECT 1, 'Default Team'
WHERE NOT EXISTS (SELECT 1 FROM teams);

ALTER TABLE users
ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT;

ALTER TABLE users
ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
CHECK (role IN ('admin', 'member'));

UPDATE users
SET team_id = COALESCE(team_id, 1),
    role = 'admin'
WHERE team_id IS NULL OR role NOT IN ('admin', 'member');

ALTER TABLE invite_codes
ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT;

ALTER TABLE invite_codes
ADD COLUMN default_role TEXT NOT NULL DEFAULT 'member'
CHECK (default_role IN ('admin', 'member'));

UPDATE invite_codes
SET team_id = COALESCE(team_id, 1),
    default_role = COALESCE(default_role, 'member');

ALTER TABLE people
ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT;

ALTER TABLE meeting_series
ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT;

ALTER TABLE meetings
ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT;

ALTER TABLE tasks
ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT;

ALTER TABLE decisions
ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT;

UPDATE people SET team_id = COALESCE(team_id, 1);
UPDATE meeting_series SET team_id = COALESCE(team_id, 1);
UPDATE meetings SET team_id = COALESCE(team_id, 1);
UPDATE tasks SET team_id = COALESCE(team_id, 1);
UPDATE decisions SET team_id = COALESCE(team_id, 1);

CREATE INDEX IF NOT EXISTS idx_users_team_role ON users(team_id, role);
CREATE INDEX IF NOT EXISTS idx_invite_codes_team ON invite_codes(team_id);
CREATE INDEX IF NOT EXISTS idx_people_team ON people(team_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_meetings_team ON meetings(team_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_meeting_series_team ON meeting_series(team_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_decisions_team ON decisions(team_id, archived_at);
