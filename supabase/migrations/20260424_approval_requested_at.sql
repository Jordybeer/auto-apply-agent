ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz;
