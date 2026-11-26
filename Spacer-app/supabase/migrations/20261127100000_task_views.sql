-- Saved views (part F): a named way of looking at a project's tasks (board or
-- list, search, quick filters, grouping, sorting), like a saved filter in
-- Jira or a saved view in ClickUp.
--
-- Rights:
--   * anyone who can see the project can save views for themselves;
--   * a shared view is seen by everyone on the project; only the project's
--     managers (can_manage_project) can share, rename or delete one;
--   * your own unshared view only you see, change and delete.
-- config is checked by the app (normalizeView); here it must be a small JSON
-- object.

create table if not exists public.task_views (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project_spaces(id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_views_name_length check (char_length(btrim(name)) between 1 and 60),
  constraint task_views_config_object check (jsonb_typeof(config) = 'object'),
  constraint task_views_config_size check (pg_column_size(config) <= 4096)
);

create index if not exists task_views_project_idx on public.task_views (project_id, owner_id);

drop trigger if exists task_views_set_updated_at on public.task_views;
create trigger task_views_set_updated_at
  before update on public.task_views
  for each row execute function public.set_updated_at();

alter table public.task_views enable row level security;

drop policy if exists task_views_select on public.task_views;
create policy task_views_select on public.task_views
  for select to authenticated
  using (has_project_access(project_id) and (owner_id = auth.uid() or is_shared));

drop policy if exists task_views_insert on public.task_views;
create policy task_views_insert on public.task_views
  for insert to authenticated
  with check (owner_id = auth.uid()
              and has_project_access(project_id)
              and (not is_shared or can_manage_project(project_id)));

drop policy if exists task_views_update on public.task_views;
create policy task_views_update on public.task_views
  for update to authenticated
  using (has_project_access(project_id)
         and ((owner_id = auth.uid() and not is_shared) or can_manage_project(project_id)))
  with check (has_project_access(project_id)
              and ((owner_id = auth.uid() and not is_shared) or can_manage_project(project_id)));

drop policy if exists task_views_delete on public.task_views;
create policy task_views_delete on public.task_views
  for delete to authenticated
  using (has_project_access(project_id)
         and ((owner_id = auth.uid() and not is_shared) or can_manage_project(project_id)));

drop policy if exists mfa_required on public.task_views;
create policy mfa_required on public.task_views as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());

-- A view keeps its project and owner (moving one would bypass the rules above)
create or replace function public.task_views_keep_owner()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  if new.project_id is distinct from old.project_id or new.owner_id is distinct from old.owner_id then
    raise exception 'A saved view stays with its project and owner.'
      using errcode = 'P0001', hint = 'task_view';
  end if;
  return new;
end;
$$;

drop trigger if exists task_views_keep_owner on public.task_views;
create trigger task_views_keep_owner
  before update of project_id, owner_id on public.task_views
  for each row execute function public.task_views_keep_owner();

revoke all on public.task_views from anon;
grant select, insert, update, delete on public.task_views to authenticated;
