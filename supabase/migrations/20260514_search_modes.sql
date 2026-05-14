-- Migration: job search modes
-- Adds search_mode (enum) and student_job_prefs (jsonb) to user_settings.
-- Safe to run multiple times (IF NOT EXISTS).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'search_mode_enum'
  ) THEN
    CREATE TYPE search_mode_enum AS ENUM ('career', 'student', 'pivot');
  END IF;
END $$;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS search_mode       search_mode_enum NOT NULL DEFAULT 'career',
  ADD COLUMN IF NOT EXISTS student_job_prefs jsonb            DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pivot_prefs       jsonb            DEFAULT NULL;

COMMENT ON COLUMN user_settings.search_mode IS
  'Active scoring context: career (default), student, or pivot.';

COMMENT ON COLUMN user_settings.student_job_prefs IS
  'JSON blob for student job prefs: { max_hours_per_week, flexible_schedule, sectors[], student_status, availability_from }.';

COMMENT ON COLUMN user_settings.pivot_prefs IS
  'JSON blob for career-pivot prefs: { target_sectors[], transferable_skills[], open_to_retraining }.';
