CREATE TABLE IF NOT EXISTS user_push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_user
ON user_push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS task_assignment_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  triggered_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  read_at TEXT,
  pushed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignment_notifications_user
ON task_assignment_notifications(user_id, read_at, created_at DESC);
