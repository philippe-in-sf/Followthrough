CREATE TABLE sessions_with_idle_timeout (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  impersonated_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO sessions_with_idle_timeout (
  token_hash,
  user_id,
  expires_at,
  created_at,
  impersonated_user_id,
  last_seen_at
)
SELECT
  token_hash,
  user_id,
  expires_at,
  created_at,
  impersonated_user_id,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM sessions;

DROP TABLE sessions;
ALTER TABLE sessions_with_idle_timeout RENAME TO sessions;

CREATE INDEX IF NOT EXISTS idx_sessions_impersonated_user
  ON sessions(impersonated_user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at
  ON sessions(last_seen_at);
