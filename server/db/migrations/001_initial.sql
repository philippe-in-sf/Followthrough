PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS id_counters (
  prefix TEXT PRIMARY KEY,
  next_value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  label TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  usage_limit INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meeting_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  cadence_label TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  meeting_type TEXT NOT NULL CHECK (meeting_type IN ('single', 'recurring')),
  series_id INTEGER REFERENCES meeting_series(id),
  summary TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meeting_attendees (
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (meeting_id, person_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  assignee_person_id INTEGER REFERENCES people(id),
  status TEXT NOT NULL CHECK (status IN ('Open', 'In Progress', 'Blocked', 'Done')),
  due_date TEXT,
  origin_meeting_id INTEGER REFERENCES meetings(id),
  series_id INTEGER REFERENCES meeting_series(id),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meeting_tasks (
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (meeting_id, task_id)
);

CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  decision_text TEXT NOT NULL,
  decision_date TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  meeting_id INTEGER REFERENCES meetings(id),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_people_public_id ON people(public_id);
CREATE INDEX IF NOT EXISTS idx_tasks_public_id ON tasks(public_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_person_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_origin_meeting ON tasks(origin_meeting_id);
CREATE INDEX IF NOT EXISTS idx_tasks_series ON tasks(series_id);
CREATE INDEX IF NOT EXISTS idx_meetings_public_id ON meetings(public_id);
CREATE INDEX IF NOT EXISTS idx_meetings_series ON meetings(series_id);
CREATE INDEX IF NOT EXISTS idx_decisions_public_id ON decisions(public_id);
CREATE INDEX IF NOT EXISTS idx_decisions_meeting ON decisions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_person ON meeting_attendees(person_id);
CREATE INDEX IF NOT EXISTS idx_meeting_tasks_task ON meeting_tasks(task_id);
