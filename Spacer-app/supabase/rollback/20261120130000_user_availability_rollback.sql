-- Undo 20261120130000_user_availability.sql
-- Drops the away period columns; everyone's away dates and notes are lost.

alter table public.users
  drop constraint if exists users_away_note_length_check,
  drop constraint if exists users_away_period_check,
  drop column if exists away_note,
  drop column if exists away_back_on,
  drop column if exists away_from;
