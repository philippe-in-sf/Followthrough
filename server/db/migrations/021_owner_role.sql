-- migrate: no-transaction
PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;
ALTER TABLE users RENAME TO users_old;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member'))
);

INSERT INTO users (id, name, email, password_hash, created_at, team_id, role)
SELECT id,
       name,
       email,
       password_hash,
       created_at,
       team_id,
       CASE
         WHEN lower(email) = 'philippe@beaudette.me' THEN 'owner'
         ELSE role
       END
FROM users_old;

DROP TABLE users_old;

CREATE INDEX IF NOT EXISTS idx_users_team_role ON users(team_id, role);

PRAGMA foreign_keys = ON;
