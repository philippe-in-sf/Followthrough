ALTER TABLE waitlist_signups
ADD COLUMN handled_at TEXT;

ALTER TABLE waitlist_signups
ADD COLUMN handled_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE waitlist_signups
ADD COLUMN handled_action TEXT
CHECK (handled_action IN ('invite_code', 'direct_user'));

ALTER TABLE waitlist_signups
ADD COLUMN handled_invite_code_id INTEGER REFERENCES invite_codes(id) ON DELETE SET NULL;

ALTER TABLE waitlist_signups
ADD COLUMN handled_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_waitlist_signups_handled_at
ON waitlist_signups(handled_at);
