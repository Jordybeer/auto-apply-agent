ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pinned_applications text[] DEFAULT '{}';
