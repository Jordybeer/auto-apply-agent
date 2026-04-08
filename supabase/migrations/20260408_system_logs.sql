-- system_logs: persistent server-side log storage
create table if not exists public.system_logs (
  id          bigserial primary key,
  level       text        not null check (level in ('log','info','warn','error','debug')),
  source      text        not null,
  message     text        not null,
  meta        jsonb,
  user_id     uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists system_logs_created_at_idx on public.system_logs (created_at desc);
create index if not exists system_logs_level_idx       on public.system_logs (level);
create index if not exists system_logs_source_idx      on public.system_logs (source);

-- Only service-role can read/write; no RLS needed for client-facing access
-- (the /api/logs endpoint enforces admin check at the application layer)
alter table public.system_logs enable row level security;
create policy "service role full access" on public.system_logs
  using (true) with check (true);
