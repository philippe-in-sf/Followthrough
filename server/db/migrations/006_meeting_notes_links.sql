ALTER TABLE meetings
ADD COLUMN notes TEXT NOT NULL DEFAULT '';

UPDATE meetings
SET notes = summary
WHERE notes = ''
AND summary <> '';

CREATE TABLE IF NOT EXISTS meeting_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'reference'
    CHECK (link_type IN ('agenda', 'work', 'reference', 'other')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meeting_links_meeting
ON meeting_links(meeting_id);
