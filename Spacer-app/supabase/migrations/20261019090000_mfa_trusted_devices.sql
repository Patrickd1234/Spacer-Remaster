-- "Remember this device for 7 days" for two-factor authentication.
-- After a user enters a code (session at aal2), the app can ask for a random
-- device token valid for 7 days. Only its SHA-256 hash is stored. The app then
-- sends the token in the `x-mfa-device` header on every request, and
-- mfa_satisfied() accepts it in place of a fresh code, so sign-ins on that
-- device skip the code prompt for a week. Tokens are per user and per device,
-- and are revoked when two-factor is turned off or the password changes.

create table if not exists public.mfa_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists mfa_trusted_devices_user_id_idx on public.mfa_trusted_devices (user_id);

-- No client policies: only the functions below read or write it
alter table public.mfa_trusted_devices enable row level security;

-- Valid device token in this request's x-mfa-device header, for the caller?
create or replace function public.is_trusted_device()
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_token text;
begin
  v_token := nullif(current_setting('request.headers', true), '')::json ->> 'x-mfa-device';
  if v_token is null or auth.uid() is null then
    return false;
  end if;
  return exists (
    select 1 from public.mfa_trusted_devices d
    where d.user_id = auth.uid()
      and d.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
      and d.expires_at > now()
  );
exception when others then
  return false;  -- malformed headers never grant access
end;
$$;

-- Passed the second factor, trusted device, or no two-factor at all
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
      )
      or public.is_trusted_device();
$$;

-- Issue a 7-day device token. Only for a session that just passed the code (aal2).
create or replace function public.trust_this_device(p_user_agent text default null)
returns text
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_token text;
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Enter your two-factor code first';
  end if;

  delete from public.mfa_trusted_devices where user_id = auth.uid() and expires_at <= now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.mfa_trusted_devices (user_id, token_hash, user_agent, expires_at)
  values (
    auth.uid(),
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    left(p_user_agent, 300),
    now() + interval '7 days'
  );
  return v_token;
end;
$$;

-- Forget every remembered device for the caller (turning 2FA off, "sign out everywhere")
create or replace function public.forget_trusted_devices()
returns void
language sql
volatile
security definer
set search_path to ''
as $$
  delete from public.mfa_trusted_devices where user_id = auth.uid();
$$;

revoke execute on function public.trust_this_device(text) from public, anon;
revoke execute on function public.forget_trusted_devices() from public, anon;
revoke execute on function public.is_trusted_device() from public, anon;
grant execute on function public.trust_this_device(text) to authenticated;
grant execute on function public.forget_trusted_devices() to authenticated;
grant execute on function public.is_trusted_device() to authenticated;

-- The table needs the same restrictive policy as every other table
drop policy if exists mfa_required on public.mfa_trusted_devices;
create policy mfa_required on public.mfa_trusted_devices
  as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
