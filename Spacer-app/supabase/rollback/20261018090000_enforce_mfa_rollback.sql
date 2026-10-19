-- Emergency undo for 20261018090000_enforce_mfa.sql.
-- Removes server-side two-factor enforcement (the app's code prompt stays).
-- Run BEFORE dropping mfa_satisfied() if the edge functions are deployed:
-- they call it, so also redeploy them without requireMfa, or keep the function.
do $$
declare
  t record;
begin
  for t in
    select tablename from pg_policies where schemaname = 'public' and policyname = 'mfa_required'
  loop
    execute format('drop policy if exists mfa_required on public.%I', t.tablename);
  end loop;
end $$;

drop policy if exists mfa_required on storage.objects;
