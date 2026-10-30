-- Undo 20261030130000_has_password.sql
-- Deploy the previous change-password function first: the new one calls this.
drop function if exists public.has_password();
