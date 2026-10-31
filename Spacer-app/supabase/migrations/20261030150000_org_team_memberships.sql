-- Let everyone in an organization see which teams its people belong to.
-- Rollback: supabase/rollback/20261030150000_org_team_memberships_rollback.sql
--
-- The People Directory shows each person's teams and filters by team. The
-- memberships and team_spaces policies only let a member read their own
-- teams, so for members every other person looked team-less and the team
-- filter listed one team. Those policies stay as they are; this returns only
-- what the directory needs (person, team id and name, role), only for the
-- caller's own organization, and only once MFA is satisfied (like the
-- restrictive mfa_required policies on the tables).

create or replace function public.org_team_memberships()
returns table (user_id uuid, team_space_id uuid, team_name text, role text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.user_id, t.id, t.name::text, m.role::text
  from memberships m
  join team_spaces t on t.id = m.team_space_id
  join users u on u.id = m.user_id
  where t.organization_id = current_org_id()
    and u.organization_id = t.organization_id
    and mfa_satisfied();
$$;

revoke execute on function public.org_team_memberships() from public, anon;
grant execute on function public.org_team_memberships() to authenticated;
