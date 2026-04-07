-- Migration: Add missing columns and fix status constraint
-- Run this in Supabase SQL Editor

-- ─────────────────────────────────────────────────────────────
-- 1. Fix applications status CHECK constraint to include 'accepted'
-- ─────────────────────────────────────────────────────────────
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check;
ALTER TABLE applications ADD CONSTRAINT applications_status_check
  CHECK (status IN ('draft', 'saved', 'skipped', 'applied', 'in_progress', 'rejected', 'accepted'));

-- ─────────────────────────────────────────────────────────────
-- 2. Add missing columns to applications table
-- ─────────────────────────────────────────────────────────────
ALTER TABLE applications ADD COLUMN IF NOT EXISTS sent_via_email boolean DEFAULT false;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS note text;

-- ─────────────────────────────────────────────────────────────
-- 3. Add missing columns to jobs table
-- ─────────────────────────────────────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS matched_tags text[];

-- ─────────────────────────────────────────────────────────────
-- 4. Add missing columns to user_settings table
-- ─────────────────────────────────────────────────────────────
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
