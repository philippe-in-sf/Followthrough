CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_google_oauth_states_expires_at
  ON google_oauth_states(expires_at);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
  ON password_reset_tokens(expires_at);
