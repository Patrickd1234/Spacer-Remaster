-- Daily stand-ups belong to a department: the sheet shows one department's
-- stand-ups at a time. Nullable so older clients and existing rows still work;
-- stand-ups go with their department when it is deleted.

alter table public.daily_standups
  add column if not exists team_space_id uuid references public.team_spaces(id) on delete cascade;

create index if not exists daily_standups_team_space_date_idx
  on public.daily_standups (team_space_id, standup_date desc);

-- Existing stand-ups: assign the author's department when they belong to exactly one.
-- Others stay unassigned and no longer appear on any department's sheet.
update public.daily_standups s
set team_space_id = m.team_space_id
from (
  select user_id, min(team_space_id::text)::uuid as team_space_id
  from public.memberships
  where team_space_id is not null
  group by user_id
  having count(distinct team_space_id) = 1
) m
where s.user_id = m.user_id
  and s.team_space_id is null;
