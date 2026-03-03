-- Create jobs table
CREATE TABLE jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id text NOT NULL UNIQUE, -- e.g., 'vdab-12345'
  title text NOT NULL,
  company text,
  url text NOT NULL,
  description text,
  skills_required jsonb,
  source text NOT NULL, -- 'vdab', 'jobat'
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create applications table (your drafts queue)
CREATE TABLE applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  match_score integer,
  cover_letter_draft text,
  resume_bullets_draft jsonb,
  status text DEFAULT 'draft', -- 'draft', 'sent', 'skipped'
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);