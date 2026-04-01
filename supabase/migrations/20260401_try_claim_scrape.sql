-- Migration: try_claim_scrape
-- Atomically checks and claims the per-user scrape cooldown slot.
-- Returns TRUE  → the caller may proceed (slot was free, timestamp updated).
-- Returns FALSE → cooldown is still active, caller must back off.
--
-- This replaces the previous read-then-write pattern in app/api/scrape/route.ts
-- which had a race condition: two concurrent requests could both read the same
-- last_scrape_at value before either wrote the updated timestamp.
--
-- Run via: supabase db push  OR paste into the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.try_claim_scrape(
  p_user_id     uuid,
  p_cooldown_ms integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_at timestamptz;
BEGIN
  -- Lock the row for the duration of this transaction so concurrent calls
  -- cannot both pass the cooldown check simultaneously.
  SELECT last_scrape_at
  INTO   v_last_at
  FROM   public.user_settings
  WHERE  user_id = p_user_id
  FOR UPDATE;

  -- If the row doesn’t exist yet (first scrape ever), proceed and insert below.
  -- If the cooldown has not elapsed, return false.
  IF v_last_at IS NOT NULL
     AND EXTRACT(EPOCH FROM (now() - v_last_at)) * 1000 < p_cooldown_ms
  THEN
    RETURN false;
  END IF;

  -- Stamp the timestamp atomically inside the same transaction.
  UPDATE public.user_settings
  SET    last_scrape_at = now()
  WHERE  user_id = p_user_id;

  RETURN true;
END;
$$;

-- Grant execute to the authenticated role so the Supabase client can call it.
GRANT EXECUTE ON FUNCTION public.try_claim_scrape(uuid, integer)
  TO authenticated;
