-- =====================================================
-- Migration: Schema Fixes for Auto-Apply Agent
-- =====================================================
-- This migration addresses schema gaps found during code analysis.
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)
--
-- IMPORTANT: Run each section separately and verify no errors before proceeding.
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. Add 'accepted' status to applications CHECK constraint
--    (Required by: app/api/applied/route.ts, app/queue/QueueContent.tsx)
-- ─────────────────────────────────────────────────────
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check;
ALTER TABLE applications ADD CONSTRAINT applications_status_check
  CHECK (status IN ('draft', 'saved', 'skipped', 'applied', 'in_progress', 'rejected', 'accepted'));

-- ─────────────────────────────────────────────────────
-- 2. Add missing columns to 'jobs' table
--    (Required by: app/api/scrape/route.ts, app/insights/page.tsx)
-- ─────────────────────────────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS matched_tags text[];

-- ─────────────────────────────────────────────────────
-- 3. Add missing columns to 'applications' table
--    (Required by: app/api/send-application/route.ts, app/api/applications/[id]/note/route.ts)
-- ─────────────────────────────────────────────────────
ALTER TABLE applications ADD COLUMN IF NOT EXISTS sent_via_email boolean DEFAULT false;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS note text;

-- ─────────────────────────────────────────────────────
-- 4. Add missing columns to 'user_settings' table
--    (Required by: app/api/settings/route.ts, app/api/scrape/route.ts)
-- ─────────────────────────────────────────────────────
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS adzuna_app_id text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS adzuna_app_key text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS adzuna_calls_today integer DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS adzuna_calls_month integer DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS last_call_date text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS auto_apply_threshold integer;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS is_onboarded boolean DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS email_signature text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS cv_text text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS scrape_do_token text;

-- ─────────────────────────────────────────────────────
-- 5. Create helper function for scrape cooldown (optional)
--    (Used by: app/api/scrape/route.ts)
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION try_claim_scrape(
  p_user_id uuid,
  p_cooldown_ms integer DEFAULT 60000
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_scrape timestamptz;
  ms_since_last bigint;
BEGIN
  SELECT last_scrape_at INTO last_scrape
  FROM user_settings
  WHERE user_id = p_user_id;

  IF last_scrape IS NULL THEN
    -- No previous scrape, claim it
    UPDATE user_settings
    SET last_scrape_at = now()
    WHERE user_id = p_user_id;
    RETURN true;
  END IF;

  ms_since_last := EXTRACT(EPOCH FROM (now() - last_scrape)) * 1000;

  IF ms_since_last < p_cooldown_ms THEN
    RETURN false;  -- Cooldown active
  END IF;

  -- Cooldown passed, claim new scrape
  UPDATE user_settings
  SET last_scrape_at = now()
  WHERE user_id = p_user_id;
  RETURN true;
END;
$$;

-- ─────────────────────────────────────────────────────
-- 6. Create helper function for Adzuna call tracking (optional)
--    (Used by: app/api/scrape/route.ts)
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_adzuna_calls(
  p_user_id uuid,
  p_today text,
  p_is_new_day boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_is_new_day THEN
    UPDATE user_settings
    SET 
      adzuna_calls_today = 1,
      adzuna_calls_month = COALESCE(adzuna_calls_month, 0) + 1,
      last_call_date = p_today
    WHERE user_id = p_user_id;
  ELSE
    UPDATE user_settings
    SET 
      adzuna_calls_today = COALESCE(adzuna_calls_today, 0) + 1,
      adzuna_calls_month = COALESCE(adzuna_calls_month, 0) + 1,
      last_call_date = p_today
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- =====================================================
-- Verification queries (run after migration)
-- =====================================================
-- Check applications status constraint:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'applications_status_check';

-- Check jobs columns:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'matched_tags';

-- Check user_settings columns:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'user_settings' ORDER BY ordinal_position;

-- Check functions exist:
-- SELECT proname FROM pg_proc WHERE proname IN ('try_claim_scrape', 'increment_adzuna_calls');
