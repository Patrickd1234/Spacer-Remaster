-- Enforce two-factor authentication on the server.
-- Once a user has a verified MFA factor (Supabase Auth TOTP), their requests
-- only get data when the session has passed the second factor (aal2). The
-- app's code prompt alone isn't enough: someone with a stolen password could
-- call the API directly with the first-factor (aal1) token.
-- Users without MFA are unaffected. Service-role code and SECURITY DEFINER
-- functions are unaffected.

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

-- RESTRICTIVE: combined with AND on top of every table's existing policies
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists mfa_required on public.%I', t.relname);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated
         using (public.mfa_satisfied()) with check (public.mfa_satisfied())',
      t.relname
    );
  end loop;
end $$;

-- Same for stored files (project-files, chat-attachments)
drop policy if exists mfa_required on storage.objects;
create policy mfa_required on storage.objects
  as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
