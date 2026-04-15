-- is_active: operator moderation flag
alter table public.user_settings
  add column if not exists is_active boolean not null default true;

-- llm rate-limit counters (resets daily in application layer)
alter table public.user_settings
  add column if not exists llm_calls_today  integer not null default 0,
  add column if not exists llm_last_call_date date;
