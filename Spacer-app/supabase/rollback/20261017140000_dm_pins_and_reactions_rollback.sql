-- Emergency undo for 20261017140000_dm_pins_and_reactions.sql.
-- Deletes all DM reactions and pins. The updated app needs these objects,
-- so roll the frontend back too (SidebarRouter.jsx) if you run this.
drop table if exists public.direct_message_reactions;
drop function if exists public.is_dm_participant(uuid);
drop function if exists public.toggle_dm_pin(uuid);
alter table public.direct_messages drop column if exists pinned;
