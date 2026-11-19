-- Short task keys (GitHub automation, step 1). A task's key names its
-- department and project, and counts within that project:
--   Development department + project "Nightfall" -> "DEVNGT-1", "DEVNGT-2", ...
-- Tasks with no project count on the organization's prefix: "SPA-3" (as will
-- projects shared by several departments, once collaboration exists).
-- A task keeps its key for life, even when it moves to another project, so
-- branch names and commit messages that mention it keep working.
-- Rollback: supabase/rollback/20261119100000_task_keys_rollback.sql
--
-- Additive. Existing tasks are numbered in the order they were created, with
-- the task triggers switched off so the backfill doesn't write activity,
-- notifications or new updated_at times.

-- ---------------------------------------------------------------------------
-- 1. Prefixes
-- ---------------------------------------------------------------------------

-- Organization and department part: "Circle Corp" -> "CC", "Development" ->
-- "DEV", "Human Resource" -> "HR"; "TASK" when nothing fits
create or replace function public.default_task_key_prefix(p_name text)
returns text
language plpgsql
immutable
set search_path to ''
as $$
declare
  v_words text[];
  v_prefix text;
begin
  v_words := array_remove(
    regexp_split_to_array(upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9]+', ' ', 'g')), '\s+'),
    '');
  if coalesce(array_length(v_words, 1), 0) >= 2 then
    select string_agg(left(w, 1), '' order by i) into v_prefix
    from unnest(v_words[1:3]) with ordinality as t(w, i);
  else
    v_prefix := left(coalesce(v_words[1], ''), 3);
  end if;
  v_prefix := regexp_replace(v_prefix, '^[0-9]+', '');
  if char_length(v_prefix) < 2 then
    return 'TASK';
  end if;
  return v_prefix;
end;
$$;

-- Project part: initials of up to three words ("Mobile App Launch" -> "MAL"),
-- or for one word its first letter and next consonants ("Nightfall" -> "NGT");
-- "P" when nothing fits
create or replace function public.default_project_key_code(p_name text)
returns text
language plpgsql
immutable
set search_path to ''
as $$
declare
  v_words text[];
  v_code text;
begin
  v_words := array_remove(
    regexp_split_to_array(upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9]+', ' ', 'g')), '\s+'),
    '');
  if coalesce(array_length(v_words, 1), 0) >= 2 then
    select string_agg(left(w, 1), '' order by i) into v_code
    from unnest(v_words[1:3]) with ordinality as t(w, i);
  elsif coalesce(array_length(v_words, 1), 0) = 1 then
    v_code := left(v_words[1], 1)
      || regexp_replace(regexp_replace(substr(v_words[1], 2), '[AEIOUYH]', '', 'g'), '(.)\1+', '\1', 'g');
    if char_length(v_code) < 2 then
      v_code := v_words[1];
    end if;
    v_code := left(v_code, 3);
  end if;
  return coalesce(nullif(v_code, ''), 'P');
end;
$$;

alter table public.organizations add column if not exists task_key_prefix text;
alter table public.team_spaces add column if not exists task_key_prefix text;
alter table public.project_spaces add column if not exists task_key_prefix text;

-- Is the full prefix already used in the organization (by the organization
-- itself or by another project)? A key must point at exactly one task.
create or replace function public.task_key_prefix_taken(p_org_id uuid, p_prefix text, p_except_project uuid default null)
returns boolean
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select exists (select 1 from organizations where id = p_org_id and task_key_prefix = p_prefix)
      or exists (select 1 from project_spaces p join team_spaces t on t.id = p.team_space_id
                 where t.organization_id = p_org_id and p.task_key_prefix = p_prefix
                   and p.id is distinct from p_except_project);
$$;

-- department part + project part, or DEVNGT2, DEVNGT3... when that is taken
create or replace function public.unique_project_key_prefix(p_team_space_id uuid, p_project_name text, p_except_project uuid default null)
returns text
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $$
declare
  v_org uuid;
  v_base text;
  v_try text;
  v_n integer := 1;
begin
  select organization_id, task_key_prefix || default_project_key_code(p_project_name)
    into v_org, v_base
    from team_spaces where id = p_team_space_id;
  v_base := left(v_base, 12);
  v_try := v_base;
  while task_key_prefix_taken(v_org, v_try, p_except_project) loop
    v_n := v_n + 1;
    v_try := left(v_base, 12 - char_length(v_n::text)) || v_n;
  end loop;
  return v_try;
end;
$$;

revoke execute on function public.task_key_prefix_taken(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.unique_project_key_prefix(uuid, text, uuid) from public, anon, authenticated;

-- Backfill: organizations, departments, then projects in creation order
update public.organizations
  set task_key_prefix = public.default_task_key_prefix(name)
  where task_key_prefix is null;
update public.team_spaces
  set task_key_prefix = public.default_task_key_prefix(name)
  where task_key_prefix is null;

do $$
declare
  v_project record;
begin
  for v_project in select id, team_space_id, name from public.project_spaces
                   where task_key_prefix is null order by created_at, id loop
    update public.project_spaces
      set task_key_prefix = public.unique_project_key_prefix(v_project.team_space_id, v_project.name, v_project.id)
      where id = v_project.id;
  end loop;
end;
$$;

alter table public.organizations
  alter column task_key_prefix set not null,
  add constraint organizations_task_key_prefix_check check (task_key_prefix ~ '^[A-Z][A-Z0-9]{1,9}$');
alter table public.team_spaces
  alter column task_key_prefix set not null,
  add constraint team_spaces_task_key_prefix_check check (task_key_prefix ~ '^[A-Z][A-Z0-9]{1,9}$');
alter table public.project_spaces
  alter column task_key_prefix set not null,
  add constraint project_spaces_task_key_prefix_check check (task_key_prefix ~ '^[A-Z][A-Z0-9]{1,11}$');

-- New organizations, departments and projects get a prefix from their names.
-- A project keeps its prefix when renamed or moved to another department.
create or replace function public.set_default_task_key_prefix()
returns trigger
language plpgsql
set search_path to public, pg_temp
as $$
begin
  if new.task_key_prefix is null then
    new.task_key_prefix := default_task_key_prefix(new.name);
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_set_task_key_prefix on public.organizations;
create trigger organizations_set_task_key_prefix
  before insert on public.organizations
  for each row execute function public.set_default_task_key_prefix();

drop trigger if exists team_spaces_set_task_key_prefix on public.team_spaces;
create trigger team_spaces_set_task_key_prefix
  before insert on public.team_spaces
  for each row execute function public.set_default_task_key_prefix();

create or replace function public.project_spaces_set_task_key_prefix()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_org uuid;
begin
  if new.task_key_prefix is null then
    new.task_key_prefix := unique_project_key_prefix(new.team_space_id, new.name, new.id);
    return new;
  end if;
  select organization_id into v_org from team_spaces where id = new.team_space_id;
  if task_key_prefix_taken(v_org, new.task_key_prefix, new.id) then
    raise exception 'The task key prefix % is already used in this organization', new.task_key_prefix
      using errcode = '23505';
  end if;
  return new;
end;
$$;

revoke execute on function public.project_spaces_set_task_key_prefix() from public, anon, authenticated;

drop trigger if exists project_spaces_set_task_key_prefix on public.project_spaces;
create trigger project_spaces_set_task_key_prefix
  before insert or update of task_key_prefix on public.project_spaces
  for each row execute function public.project_spaces_set_task_key_prefix();

-- Every prefix in the caller's organization: its own, and each project's.
-- People see tasks from projects whose department they can't read, so the app
-- reads prefixes here. scope_id is what tasks.task_key_scope holds: a project
-- id, or the organization id for organization keys.
create or replace function public.task_key_prefixes()
returns table (scope_id uuid, prefix text)
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select id, task_key_prefix from organizations where id = current_org_id()
  union all
  select p.id, p.task_key_prefix
  from project_spaces p join team_spaces t on t.id = p.team_space_id
  where t.organization_id = current_org_id();
$$;

revoke execute on function public.task_key_prefixes() from public, anon;
grant execute on function public.task_key_prefixes() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Task numbers
-- ---------------------------------------------------------------------------

-- Next number per project (or organization); only the trigger below touches it
create table if not exists public.task_key_counters (
  scope_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  next_number integer not null check (next_number > 0)
);

alter table public.task_key_counters enable row level security;
revoke all on public.task_key_counters from anon, authenticated;

alter table public.tasks
  add column if not exists task_key_scope uuid,
  add column if not exists task_number integer;

-- Backfill in creation order, without firing the task triggers. A task counts
-- in its project; in the organization when it has none.
alter table public.tasks disable trigger user;
update public.tasks
  set task_key_scope = coalesce(project_id, organization_id)
  where task_key_scope is null;
with numbered as (
  select id, row_number() over (partition by task_key_scope order by created_at, id) as n
  from public.tasks
)
update public.tasks t set task_number = numbered.n
from numbered
where t.id = numbered.id and t.task_number is null;
alter table public.tasks enable trigger user;

insert into public.task_key_counters (scope_id, organization_id, next_number)
select task_key_scope, min(organization_id::text)::uuid, max(task_number) + 1 from public.tasks group by task_key_scope
on conflict (scope_id) do update set next_number = greatest(task_key_counters.next_number, excluded.next_number);

alter table public.tasks
  alter column task_key_scope set not null,
  alter column task_number set not null,
  add constraint tasks_task_key_key unique (task_key_scope, task_number);

-- The database always picks the key: a new task takes the next number in its
-- project (or organization), and keeps its key for life (whatever a client sends).
-- Projects shared by several departments will count on the organization too,
-- once collaboration exists: change the scope here.
create or replace function public.tasks_assign_number()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    new.task_key_scope := old.task_key_scope;
    new.task_number := old.task_number;
    return new;
  end if;
  new.task_key_scope := coalesce(new.project_id, new.organization_id);
  insert into task_key_counters (scope_id, organization_id, next_number)
  values (new.task_key_scope, new.organization_id, 2)
  on conflict (scope_id) do update set next_number = task_key_counters.next_number + 1
  returning next_number - 1 into new.task_number;
  return new;
end;
$$;

revoke execute on function public.tasks_assign_number() from public, anon, authenticated;

drop trigger if exists tasks_assign_number on public.tasks;
create trigger tasks_assign_number
  before insert or update of task_key_scope, task_number on public.tasks
  for each row execute function public.tasks_assign_number();
