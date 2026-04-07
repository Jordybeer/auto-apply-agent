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
  matched_tags     text[],
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
  contact_person       text,
  contact_email        text,
  sent_via_email       boolean     DEFAULT false,
  note                 text,
  status               text        DEFAULT 'draft'
                                   CHECK (status IN ('draft', 'saved', 'skipped', 'applied', 'in_progress', 'rejected', 'accepted')),
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
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  scrape_api_key       text,
  groq_api_key         text,
  adzuna_app_id        text,
  adzuna_app_key       text,
  adzuna_calls_today   integer     DEFAULT 0,
  adzuna_calls_month   integer     DEFAULT 0,
  last_call_date       text,
  auto_apply_threshold integer,
  is_onboarded         boolean     DEFAULT false,
  full_name            text,
  email_signature      text,
  cv_text              text,
  scrape_do_token      text,
  keywords             text[],
  city                 text        DEFAULT 'Antwerpen',
  radius               integer     DEFAULT 30,
  last_scrape_at       timestamptz,
  updated_at           timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own settings" ON user_settings FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Storage bucket for CVs
-- Run manually in Supabase dashboard > Storage:
--   1. Create bucket named 'resumes' (private)
--   2. Add policy: authenticated users can upload/read their own folder (user_id/*)
-- ─────────────────────────────────────────────────────────────
