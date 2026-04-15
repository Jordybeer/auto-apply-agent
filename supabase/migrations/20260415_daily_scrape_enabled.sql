alter table public.user_settings
  add column if not exists daily_scrape_enabled boolean not null default true;

update public.user_settings
  set daily_scrape_enabled = true
  where daily_scrape_enabled is null;
