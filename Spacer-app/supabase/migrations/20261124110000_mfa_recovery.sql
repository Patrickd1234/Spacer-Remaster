-- Getting back in after losing the phone with your authenticator.
--
-- Supabase Auth has no recovery codes, so this adds them, plus an admin reset:
--   1. Recovery codes: 10 one-time codes, shown once when two-factor is set up
--      (or regenerated in Settings). On the code screen a valid one removes the
--      person's authenticator, so they can set up their new phone.
--   2. Admin reset: an Owner or Organization Admin removes a member's
--      authenticator. Only the Owner can do it for an organization admin, and
--      nobody can do it for themselves. The admin must have two-factor on and
--      have just entered their code (aal2): a password or remembered device
--      isn't enough.
--
-- Known limits: anyone with a person's password can lock that person's
-- recovery for 15 minutes at a time with wrong codes (they can't use up real
-- ones). An Owner with no codes left and no other Owner needs the Supabase
-- dashboard (Authentication -> Users -> the user -> delete the MFA factor).
-- Access tokens already issued keep working until they expire (1 hour by
-- default) after other sessions are signed out.
-- The edge function mfa-recovery removes the authenticator itself (Supabase
-- admin API) and then calls finish_two_factor_reset() here. Both ways are
-- logged in activity_log, and the person is emailed.
--
-- Codes are stored as sha256(user id || ':' || code), never in plain text.
-- 10 characters from a 32-letter alphabet is 50 bits; on top of that, 5 wrong
-- codes in 15 minutes lock recovery for that person until the window passes.
--
-- Rollback: supabase/rollback/20261124110000_mfa_recovery_rollback.sql

-- ---------------------------------------------------------------------------
-- 1. Tables (server-only: RLS on, no policies, no grants)
-- ---------------------------------------------------------------------------

create table public.mfa_recovery_codes (
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  created_at timestamp with time zone not null default now(),
  primary key (user_id, code_hash)
);

alter table public.mfa_recovery_codes enable row level security;
revoke all on table public.mfa_recovery_codes from anon, authenticated;

-- Wrong recovery codes, for the lockout
create table public.mfa_recovery_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamp with time zone not null default now()
);

create index mfa_recovery_attempts_user_time on public.mfa_recovery_attempts (user_id, attempted_at desc);

alter table public.mfa_recovery_attempts enable row level security;
revoke all on table public.mfa_recovery_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Permission: Owner and Organization Admin (the organization roles get
--    every permission)
-- ---------------------------------------------------------------------------

insert into public.rbac_permissions (key, scope, description)
values ('member.reset_two_factor', 'organization', 'Remove a person''s authenticator when they lose their phone');

insert into public.rbac_role_permissions (role_key, permission_key)
select r.key, 'member.reset_two_factor'
from public.rbac_roles r
where r.scope = 'organization';

-- ---------------------------------------------------------------------------
-- 3. Helpers (internal)
-- ---------------------------------------------------------------------------

-- What people type: case, spaces and dashes don't matter, and the letters
-- that look like digits (o, i, l) count as those digits
create or replace function public.mfa_recovery_code_normalize(p_code text)
returns text
language sql
immutable
set search_path to ''
as $$
  select translate(regexp_replace(lower(coalesce(p_code, '')), '[^a-z0-9]', '', 'g'), 'oil', '011');
$$;

create or replace function public.mfa_recovery_code_hash(p_user_id uuid, p_code text)
returns text
language sql
immutable
set search_path to ''
as $$
  select encode(extensions.digest(p_user_id::text || ':' || p_code, 'sha256'), 'hex');
$$;

revoke execute on function public.mfa_recovery_code_normalize(text) from public, anon, authenticated;
revoke execute on function public.mfa_recovery_code_hash(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. For the app (signed-in person)
-- ---------------------------------------------------------------------------

-- New codes, replacing any earlier ones. Only right after entering an
-- authenticator code (aal2): a remembered device or a stolen password isn't
-- enough. Returns the codes in plain text; this is the only time they exist.
create or replace function public.create_mfa_recovery_codes()
returns text[]
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_user uuid := auth.uid();
  -- Crockford's base32: no i, l, o or u, so nothing is mistaken for 1 or 0
  v_alphabet constant text := '0123456789abcdefghjkmnpqrstvwxyz';
  v_code_count constant integer := 10;
  v_code_length constant integer := 10;
  v_bytes bytea;
  v_code text;
  v_codes text[] := '{}';
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not public.has_verified_mfa_factor() then
    raise exception 'Turn on two-factor first.' using errcode = 'P0001', hint = 'rbac';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Enter a code from your authenticator app first.' using errcode = '42501', hint = 'rbac';
  end if;

  delete from public.mfa_recovery_codes where user_id = v_user;

  while coalesce(array_length(v_codes, 1), 0) < v_code_count loop
    v_bytes := extensions.gen_random_bytes(v_code_length);
    v_code := '';
    for i in 0 .. v_code_length - 1 loop
      -- 32 letters, so the low 5 bits pick one without bias
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) & 31) + 1, 1);
    end loop;
    if not (v_code = any (v_codes)) then
      v_codes := v_codes || v_code;
    end if;
  end loop;

  insert into public.mfa_recovery_codes (user_id, code_hash)
  select v_user, public.mfa_recovery_code_hash(v_user, c)
  from unnest(v_codes) as c;

  return v_codes;
end;
$$;

-- How many unused codes the caller has
create or replace function public.mfa_recovery_codes_left()
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::integer from public.mfa_recovery_codes where user_id = auth.uid();
$$;

-- After turning two-factor off: the codes have nothing left to recover.
-- Refused while an authenticator is still on, unless past it (aal2), so a
-- stolen password alone can't throw someone's codes away.
create or replace function public.clear_my_mfa_recovery_codes()
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if public.has_verified_mfa_factor() and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Enter a code from your authenticator app first.' using errcode = '42501', hint = 'rbac';
  end if;
  delete from public.mfa_recovery_codes where user_id = auth.uid();
end;
$$;

revoke execute on function public.create_mfa_recovery_codes() from public, anon;
revoke execute on function public.mfa_recovery_codes_left() from public, anon;
revoke execute on function public.clear_my_mfa_recovery_codes() from public, anon;
grant execute on function public.create_mfa_recovery_codes() to authenticated;
grant execute on function public.mfa_recovery_codes_left() to authenticated;
grant execute on function public.clear_my_mfa_recovery_codes() to authenticated;

-- May the caller reset this person's two-factor? Raises the reason if not.
-- Called by the edge function with the caller's own session.
create or replace function public.check_two_factor_reset(p_target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := current_org_id();
  v_target_is_org_admin boolean;
  v_caller_is_owner boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  -- Stricter than mfa_satisfied(): a password alone (two-factor is optional)
  -- or a remembered device must not be enough to strip someone else's
  if not has_verified_mfa_factor() then
    raise exception 'Turn on two-factor for your own account first. Resetting someone else''s needs it.'
      using errcode = '42501', hint = 'rbac';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Sign out and back in with your authenticator code first. A remembered device isn''t enough for this.'
      using errcode = '42501', hint = 'rbac';
  end if;
  if p_target = auth.uid() then
    raise exception 'You can''t reset your own two-factor. Use one of your recovery codes, or ask another admin.'
      using errcode = 'P0001', hint = 'rbac';
  end if;
  if not has_org_permission('member.reset_two_factor', v_org) then
    raise exception 'Only an organization admin can reset two-factor.' using errcode = '42501', hint = 'rbac';
  end if;
  if not exists (select 1 from users u where u.id = p_target and u.organization_id = v_org) then
    raise exception 'That person isn''t in your organization.' using errcode = 'P0001', hint = 'rbac';
  end if;

  -- An organization role counts only in its own organization
  select exists (
    select 1 from memberships m
    where m.user_id = p_target
      and (m.team_space_id is null or team_space_org(m.team_space_id) = v_org)
      and membership_role_key(m.team_space_id, m.role) in (select r.key from rbac_roles r where r.scope = 'organization')
  ) into v_target_is_org_admin;

  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid()
      and (m.team_space_id is null or team_space_org(m.team_space_id) = v_org)
      and membership_role_key(m.team_space_id, m.role) = 'owner'
  ) into v_caller_is_owner;

  if v_target_is_org_admin and not v_caller_is_owner then
    raise exception 'Only the Owner can reset an organization admin''s two-factor.' using errcode = '42501', hint = 'rbac';
  end if;
  return true;
end;
$$;

revoke execute on function public.check_two_factor_reset(uuid) from public, anon;
grant execute on function public.check_two_factor_reset(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. For the edge function only (service role)
-- ---------------------------------------------------------------------------

-- Uses up one recovery code. Returns 'ok', 'invalid' or 'locked'.
create or replace function public.consume_mfa_recovery_code(p_user_id uuid, p_code text)
returns text
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_max_failures constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_failures integer;
  v_used integer;
begin
  -- One attempt at a time per person, so parallel guesses can't slip past the limit
  perform pg_advisory_xact_lock(hashtextextended('mfa_recovery:' || p_user_id::text, 0));

  select count(*) into v_failures
  from public.mfa_recovery_attempts
  where user_id = p_user_id and attempted_at > now() - v_window;
  if v_failures >= v_max_failures then
    return 'locked';
  end if;

  -- Old wrong attempts no longer count; keep the table small
  delete from public.mfa_recovery_attempts
  where user_id = p_user_id and attempted_at < now() - interval '1 day';

  delete from public.mfa_recovery_codes
  where user_id = p_user_id
    and code_hash = public.mfa_recovery_code_hash(p_user_id, public.mfa_recovery_code_normalize(p_code));
  get diagnostics v_used = row_count;

  if v_used = 0 then
    insert into public.mfa_recovery_attempts (user_id) values (p_user_id);
    return 'invalid';
  end if;
  return 'ok';
end;
$$;

-- Puts a used code back when removing the authenticator failed afterwards,
-- so a failed reset doesn't cost the person one of their codes
create or replace function public.restore_mfa_recovery_code(p_user_id uuid, p_code text)
returns void
language sql
volatile
security definer
set search_path to ''
as $$
  insert into public.mfa_recovery_codes (user_id, code_hash)
  values (p_user_id, public.mfa_recovery_code_hash(p_user_id, public.mfa_recovery_code_normalize(p_code)))
  on conflict do nothing;
$$;

-- After the authenticator is gone: forget what belonged to it, sign out the
-- person's other sessions (a lost phone may still be signed in), and log it.
-- p_keep_session: the session that used a recovery code stays signed in.
create or replace function public.finish_two_factor_reset(
  p_user_id uuid,
  p_actor_id uuid,
  p_method text,
  p_keep_session uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $$
begin
  if p_method not in ('recovery_code', 'admin_reset') then
    raise exception 'Unknown reset method %', p_method;
  end if;

  delete from public.mfa_recovery_codes where user_id = p_user_id;
  delete from public.mfa_recovery_attempts where user_id = p_user_id;
  delete from public.mfa_trusted_devices where user_id = p_user_id;
  delete from auth.sessions
  where user_id = p_user_id and (p_keep_session is null or id <> p_keep_session);

  insert into public.activity_log (entity_type, entity_id, actor_id, action, new_state, organization_id)
  select 'user', u.id, p_actor_id, 'two_factor_reset',
         jsonb_build_object('method', p_method, 'name', u.name),
         u.organization_id
  from public.users u
  where u.id = p_user_id;
end;
$$;

revoke execute on function public.consume_mfa_recovery_code(uuid, text) from public, anon, authenticated;
revoke execute on function public.restore_mfa_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function public.restore_mfa_recovery_code(uuid, text) to service_role;
revoke execute on function public.finish_two_factor_reset(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.consume_mfa_recovery_code(uuid, text) to service_role;
grant execute on function public.finish_two_factor_reset(uuid, uuid, text, uuid) to service_role;
