-- jobs table
CREATE TABLE jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  title text NOT NULL,
  company text,
  url text NOT NULL,
  location text,
  description text,
  skills_required jsonb,
  source text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, source_id)
);

-- applications table
CREATE TABLE applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  match_score integer,
  reasoning text,
  cover_letter_draft text,
  resume_bullets_draft jsonb,
  status text DEFAULT 'draft',
  applied_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- user_settings table
CREATE TABLE user_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  scrape_api_key text,
  groq_api_key text,
  keywords text[],
  city text DEFAULT 'Antwerpen',
  radius integer DEFAULT 30,
  last_scrape_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS policies (enable after creating tables)
-- ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "users see own jobs" ON jobs FOR ALL USING (auth.uid() = user_id);
-- CREATE POLICY "users see own applications" ON applications FOR ALL USING (auth.uid() = user_id);
-- CREATE POLICY "users see own settings" ON user_settings FOR ALL USING (auth.uid() = user_id);

-- Storage bucket for CVs (run in Supabase dashboard > Storage):
-- Create bucket named 'resumes' (private)
-- Add policy: allow authenticated users to upload/read their own folder (user_id/*)

-- Migrations if tables already exist:
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
-- ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_source_id_key;
-- ALTER TABLE jobs ADD CONSTRAINT jobs_user_source_unique UNIQUE (user_id, source_id);
-- ALTER TABLE applications ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
-- ALTER TABLE applications ADD COLUMN IF NOT EXISTS reasoning text;
-- ALTER TABLE applications ADD COLUMN IF NOT EXISTS applied_at timestamp with time zone;
-- ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS groq_api_key text;
