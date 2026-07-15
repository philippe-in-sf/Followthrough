ALTER TABLE sessions
ADD COLUMN impersonated_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_impersonated_user
  ON sessions(impersonated_user_id);
