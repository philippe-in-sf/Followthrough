CREATE TABLE IF NOT EXISTS user_login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_login_events_team_created
ON user_login_events(team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_login_events_user_created
ON user_login_events(user_id, created_at DESC);
