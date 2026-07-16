ALTER TABLE decisions
ADD COLUMN superseded_by_decision_id INTEGER REFERENCES decisions(id);

CREATE INDEX IF NOT EXISTS idx_decisions_superseded_by
ON decisions(superseded_by_decision_id);
