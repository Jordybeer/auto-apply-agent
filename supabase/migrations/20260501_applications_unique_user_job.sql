-- Fix: /api/analyse/save was hitting "no unique or exclusion constraint matching the
-- ON CONFLICT specification" because deployed applications table never had the
-- UNIQUE(user_id, job_id) declared in schema.sql.
--
-- Idempotent: only adds the constraint if absent. Drops dup rows first (keep oldest)
-- so the constraint can attach without violation.

DELETE FROM applications a
USING applications b
WHERE  a.user_id = b.user_id
  AND  a.job_id  = b.job_id
  AND  a.job_id IS NOT NULL
  AND  a.created_at > b.created_at;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'applications_user_id_job_id_key'
  ) THEN
    ALTER TABLE applications
      ADD CONSTRAINT applications_user_id_job_id_key UNIQUE (user_id, job_id);
  END IF;
END$$;
