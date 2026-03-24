-- Create jobs table
CREATE TABLE jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id text NOT NULL UNIQUE,
  title text NOT NULL,
  company text,
  url text NOT NULL,
  location text,
  description text,
  skills_required jsonb,
  source text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create applications table
CREATE TABLE applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  match_score integer,
  reasoning text,
  cover_letter_draft text,
  resume_bullets_draft jsonb,
  status text DEFAULT 'draft',
  applied_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create user_settings table
CREATE TABLE user_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  scrape_api_key text,
  groq_api_key text,
  keywords text[],
  city text DEFAULT 'Antwerpen',
  radius integer DEFAULT 30,
  last_scrape_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Migrations: run these if tables already exist
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location text;
-- ALTER TABLE applications ADD COLUMN IF NOT EXISTS applied_at timestamp with time zone;
-- ALTER TABLE applications ADD COLUMN IF NOT EXISTS reasoning text;
-- ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS groq_api_key text;
