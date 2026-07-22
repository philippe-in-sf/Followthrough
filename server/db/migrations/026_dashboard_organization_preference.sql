ALTER TABLE user_preferences
ADD COLUMN dashboard_organization TEXT NOT NULL DEFAULT 'workflow'
CHECK (dashboard_organization IN ('workflow', 'entity'));
