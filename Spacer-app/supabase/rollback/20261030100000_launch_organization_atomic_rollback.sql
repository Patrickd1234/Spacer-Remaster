-- Undo 20261030100000_launch_organization_atomic.sql.
-- Deploy the previous launch-organization edge function first: the current one
-- calls launch_organization(). The admin memberships added by the backfill are
-- kept on purpose (removing them would leave those organizations without an admin).

drop function if exists public.launch_organization(uuid, text, jsonb);

create or replace function public.claim_pending_invites()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_invite record;
begin
  select email into v_email from users where id = auth.uid();
  if v_email is null then
    return;
  end if;

  for v_invite in
    select * from invites where lower(email) = lower(v_email) and accepted_at is null
  loop
    update users set organization_id = v_invite.organization_id
      where id = auth.uid() and organization_id is null;

    insert into memberships (user_id, team_space_id, role)
    values (auth.uid(), v_invite.team_space_id, v_invite.role)
    on conflict do nothing;

    update invites set accepted_at = now() where id = v_invite.id;
  end loop;
end;
$$;
