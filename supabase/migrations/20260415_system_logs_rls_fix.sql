-- Fix system_logs RLS: restrict full-access policy to service_role only.
-- Without TO service_role, the USING (true) policy applied to all roles,
-- allowing any authenticated user to SELECT all log rows.
drop policy if exists "service role full access" on public.system_logs;

create policy "service role full access"
  on public.system_logs
  to service_role
  using (true)
  with check (true);
