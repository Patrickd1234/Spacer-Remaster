-- Undo 20261112100000_rbac_foundation.sql
-- Safe while no policy or helper calls has_permission() yet. If a later
-- migration has moved helpers onto it, roll that one back first.
-- No user data is lost: who holds which role lives in memberships.

drop function if exists public.my_permissions();
drop function if exists public.has_org_permission(text, uuid);
drop function if exists public.has_permission(text, uuid);
drop function if exists public.membership_role_key(uuid, public.membership_role);
drop table if exists public.rbac_role_permissions;
drop table if exists public.rbac_permissions;
drop table if exists public.rbac_roles;
