-- Production constraints were created with wrong values.
-- tier only allowed 'past_due'/'trialing' instead of 'free'/'premium'.
-- provider only allowed 'active'/'active' instead of 'stripe'/'apple'.

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_tier_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_tier_check
    CHECK (tier IN ('free', 'premium'));

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_provider_check
    CHECK (provider IN ('stripe', 'apple'));

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled'));
