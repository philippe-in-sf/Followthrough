ALTER TABLE user_preferences
ADD COLUMN weekly_digest_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS digest_email_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_digest_email_events_user_period
ON digest_email_events(user_id, period_start, period_end);
