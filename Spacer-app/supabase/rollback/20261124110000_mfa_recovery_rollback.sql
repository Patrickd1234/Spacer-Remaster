-- Undo 20261124110000_mfa_recovery.sql: no recovery codes, no admin reset.
-- Everyone's recovery codes are deleted. Undeploy the mfa-recovery edge
-- function too (supabase functions delete mfa-recovery).

drop function if exists public.finish_two_factor_reset(uuid, uuid, text, uuid);
drop function if exists public.consume_mfa_recovery_code(uuid, text);
drop function if exists public.restore_mfa_recovery_code(uuid, text);
drop function if exists public.check_two_factor_reset(uuid);
drop function if exists public.clear_my_mfa_recovery_codes();
drop function if exists public.mfa_recovery_codes_left();
drop function if exists public.create_mfa_recovery_codes();
drop function if exists public.mfa_recovery_code_hash(uuid, text);
drop function if exists public.mfa_recovery_code_normalize(text);

delete from public.rbac_role_permissions where permission_key = 'member.reset_two_factor';
delete from public.rbac_permissions where key = 'member.reset_two_factor';

drop table if exists public.mfa_recovery_attempts;
drop table if exists public.mfa_recovery_codes;
