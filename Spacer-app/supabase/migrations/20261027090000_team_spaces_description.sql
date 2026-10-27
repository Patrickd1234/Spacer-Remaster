-- Optional department description, collected by the Create Department form.
-- Nullable and additive: existing rows and older clients are unaffected.
-- 1500 characters comfortably fits the form's 150-word limit.

alter table public.team_spaces
  add column if not exists description text
  check (description is null or char_length(description) <= 1500);
