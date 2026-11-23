-- Away periods: a person marks themselves away from one day until the day
-- they're back, with an optional note, so whoever assigns tasks can see it.
-- Rollback: supabase/rollback/20261120130000_user_availability_rollback.sql
--
-- Additive only: three nullable columns on users, so existing rows and
-- queries keep working.
--
-- Who can set it: only the person themselves. users_update_self already
-- limits updates to your own row (id = auth.uid()), and no policy or function
-- writes these columns for anyone else. Who can read it: the same people who
-- can read the rest of the row (users_select_same_org: your organization).
--
-- One period at a time. away_from is the first day away and away_back_on the
-- first day back; both are set together or both are empty.

alter table public.users
  add column if not exists away_from date,
  add column if not exists away_back_on date,
  add column if not exists away_note text,
  drop constraint if exists users_away_period_check,
  add constraint users_away_period_check check (
    (away_from is null and away_back_on is null and away_note is null)
    or (away_from is not null and away_back_on is not null and away_back_on > away_from)
  ),
  drop constraint if exists users_away_note_length_check,
  add constraint users_away_note_length_check check (char_length(away_note) <= 80);

comment on column public.users.away_from is 'First day the person is away (set by themselves).';
comment on column public.users.away_back_on is 'First day the person is back; not counted as away.';
comment on column public.users.away_note is 'Optional short note shown with the away period, up to 80 characters.';
