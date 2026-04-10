-- Add note column to applications for user annotations
ALTER TABLE applications ADD COLUMN IF NOT EXISTS note text;
