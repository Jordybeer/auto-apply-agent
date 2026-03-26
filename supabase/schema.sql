-- ─────────────────────────────────────────────────────────────
-- jobs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE jobs (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id        text,
  title            text        NOT NULL,
  company          text,
  url              text,
  location         text,
  description      text,
  skills_required  jsonb,
  salary           text,
  contract_type    text,
  source           text        NOT NULL,
  created_at       timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  UNIQUE(user_id, source_id)
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own jobs" ON jobs FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- applications
-- ─────────────────────────────────────────────────────────────
CREATE TABLE applications (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id               uuid        REFERENCES jobs(id) ON DELETE CASCADE,
  match_score          integer,
  reasoning            text,
  cover_letter_draft   text,
  resume_bullets_draft jsonb,
  status               text        DEFAULT 'draft'
                                   CHECK (status IN ('draft', 'saved', 'skipped', 'applied', 'in_progress', 'rejected')),
  applied_at           timestamptz,
  status_changed_at    timestamptz,
  created_at           timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own applications" ON applications FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- user_settings
-- ─────────────────────────────────────────────────────────────
CREATE TABLE user_settings (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  scrape_api_key  text,
  groq_api_key    text,
  keywords        text[],
  city            text        DEFAULT 'Antwerpen',
  radius          integer     DEFAULT 30,
  last_scrape_at  timestamptz,
  updated_at      timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own settings" ON user_settings FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Storage bucket for CVs
-- Run manually in Supabase dashboard > Storage:
--   1. Create bucket named 'resumes' (private)
--   2. Add policy: authenticated users can upload/read their own folder (user_id/*)
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- Migrations (run in Supabase SQL Editor if tables already exist)
-- ─────────────────────────────────────────────────────────────
-- ALTER TABLE jobs ALTER COLUMN source_id DROP NOT NULL;
-- ALTER TABLE jobs ALTER COLUMN url DROP NOT NULL;
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary text;
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS contract_type text;
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
-- ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_source_id_key;
-- ALTER TABLE jobs ADD CONSTRAINT jobs_user_source_unique UNIQUE (user_id, source_id);

-- ALTER TABLE applications ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
-- ALTER TABLE applications ADD COLUMN IF NOT EXISTS reasoning text;
-- ALTER TABLE applications ADD COLUMN IF NOT EXISTS applied_at timestamptz;
-- ALTER TABLE applications ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
-- ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check;
-- ALTER TABLE applications ADD CONSTRAINT applications_status_check
--   CHECK (status IN ('draft', 'saved', 'skipped', 'applied', 'in_progress', 'rejected'));

-- ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS groq_api_key text;
