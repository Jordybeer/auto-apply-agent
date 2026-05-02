-- Production constraint was created with different allowed values.
-- Align it with schema.sql so 'active' is valid.
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active','trialing','past_due','canceled'));
