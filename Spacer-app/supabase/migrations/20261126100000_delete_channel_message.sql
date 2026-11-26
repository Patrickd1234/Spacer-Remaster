-- Delete a group chat message without deleting other people's replies.
-- messages.parent_message_id is ON DELETE CASCADE, so a plain delete of a
-- message would also delete every reply to it (written by anyone). This
-- unlinks the replies first (they stay, without the quote), then deletes the
-- message; its reactions and attachment rows still go with it (cascade).
-- Same rules as the messages_delete policy: the author, or whoever manages the
-- channel. security definer skips row-level security, so the MFA rule that
-- policies enforce (mfa_required) is checked here too.
-- Attachment files in storage are removed by the app first (GroupChat.jsx),
-- since the storage policy needs the message to still exist.

create or replace function public.delete_channel_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_channel_id uuid;
  v_author_id uuid;
begin
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required';
  end if;

  select channel_id, user_id into v_channel_id, v_author_id
    from public.messages
   where id = p_message_id;

  if v_channel_id is null
     or not (v_author_id = auth.uid() or public.can_manage_channel(v_channel_id)) then
    raise exception 'Message not found';
  end if;

  update public.messages
     set parent_message_id = null
   where parent_message_id = p_message_id;

  delete from public.messages where id = p_message_id;
end;
$$;

revoke execute on function public.delete_channel_message(uuid) from public, anon;
grant execute on function public.delete_channel_message(uuid) to authenticated;
