create table if not exists public.push_subscriptions (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at   timestamptz default now()
);

alter table public.push_subscriptions enable row level security;

create policy "users manage own subscription"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id);
