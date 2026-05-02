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
  contact_person       text,
  contact_email        text,
  status               text        DEFAULT 'draft'
                                   CHECK (status IN ('draft', 'saved', 'skipped', 'applied', 'in_progress', 'rejected', 'accepted')),
  applied_at           timestamptz,
  status_changed_at    timestamptz,
  sent_via_email       boolean     DEFAULT false,
  note                 text,
  created_at           timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  UNIQUE(user_id, job_id)
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own applications" ON applications FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- user_settings
-- ─────────────────────────────────────────────────────────────
CREATE TABLE user_settings (
  id                         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                    uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  groq_api_key               text,
  full_name                  text,
  email_signature            text,
  keywords                   text[],
  city                       text        DEFAULT 'Antwerpen',
  radius                     integer     DEFAULT 30,
  last_scrape_at             timestamptz,
  updated_at                 timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  is_onboarded               boolean     NOT NULL DEFAULT false,
  adzuna_app_id              text,
  adzuna_app_key             text,
  adzuna_calls_today         integer     NOT NULL DEFAULT 0,
  adzuna_calls_month         integer     NOT NULL DEFAULT 0,
  last_call_date             date,
  auto_apply_threshold       integer,
  cv_text                    text,
  cv_structured              jsonb,
  suggested_titles           text[],
  suggestions_generated_at   timestamptz,
  job_titles                 text[],
  daily_scrape_enabled       boolean     NOT NULL DEFAULT true,
  is_active                  boolean     NOT NULL DEFAULT true,
  llm_calls_today            integer     NOT NULL DEFAULT 0,
  llm_last_call_date         date,
  last_pdf_export            timestamptz,
  pinned_applications        text[]      DEFAULT '{}'
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own settings" ON user_settings FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- push_subscriptions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE push_subscriptions (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription jsonb       NOT NULL,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own subscription" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- system_logs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE system_logs (
  id         bigserial    PRIMARY KEY,
  level      text         NOT NULL CHECK (level IN ('log', 'info', 'warn', 'error', 'debug')),
  source     text         NOT NULL,
  message    text         NOT NULL,
  meta       jsonb,
  user_id    uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX system_logs_created_at_idx ON system_logs (created_at DESC);
CREATE INDEX system_logs_level_idx      ON system_logs (level);
CREATE INDEX system_logs_source_idx     ON system_logs (source);

ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON system_logs
  TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- Storage bucket for CVs
-- Run manually in Supabase dashboard > Storage:
--   1. Create bucket named 'resumes' (private)
--   2. Add policy: authenticated users can upload/read their own folder (user_id/*)
-- ─────────────────────────────────────────────────────────────

-- Wave 6: subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                text        NOT NULL DEFAULT 'free' CHECK (tier IN ('free','premium')),
  provider            text        CHECK (provider IN ('stripe','apple')),
  provider_sub_id     text,
  status              text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','trialing','past_due','canceled')),
  current_period_end  timestamptz,
  trial_end           timestamptz,
  created_at          timestamptz DEFAULT now() NOT NULL,
  updated_at          timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_select_own ON subscriptions FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS scored_today          integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scored_today_reset_at timestamptz;

-- ─────────────────────────────────────────────────────────────
-- Wave 7: notifications (in-app notification center)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text        NOT NULL,
  body       text        NOT NULL,
  url        text,
  read_at    timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx ON notifications (user_id, created_at DESC);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own notifications" ON notifications
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Wave 7: device_tokens (APNs — ready for when p8 is available)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_tokens (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text        NOT NULL,
  platform   text        NOT NULL DEFAULT 'ios',
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, token)
);
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own device tokens" ON device_tokens
  FOR ALL USING (auth.uid() = user_id);
