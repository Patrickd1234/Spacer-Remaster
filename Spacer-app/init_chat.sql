-- SQL Script to create chat messaging tables

CREATE TABLE IF NOT EXISTS public.chat_channels (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    project_id uuid, -- Can be null if it's department level, but let's assume it maps to project_spaces or team_spaces
    department_id uuid,
    name text NOT NULL,
    is_private boolean DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chat_channels_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.chat_channel_members (
    channel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chat_channel_members_pkey PRIMARY KEY (channel_id, user_id),
    CONSTRAINT chat_channel_members_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id) ON DELETE CASCADE,
    CONSTRAINT chat_channel_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.messages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    channel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    parent_message_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT messages_pkey PRIMARY KEY (id),
    CONSTRAINT messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id) ON DELETE CASCADE,
    CONSTRAINT messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT messages_parent_message_id_fkey FOREIGN KEY (parent_message_id) REFERENCES public.messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.message_reactions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT message_reactions_pkey PRIMARY KEY (id),
    CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE,
    CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT message_reactions_unique UNIQUE(message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS public.message_attachments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL,
    file_url text NOT NULL,
    file_type text NOT NULL,
    file_name text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT message_attachments_pkey PRIMARY KEY (id),
    CONSTRAINT message_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE
);

-- Realtime Setup
ALTER PUBLICATION supabase_realtime ADD TABLE chat_channels;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_channel_members;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE message_attachments;

-- Enable RLS
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies (Allow all authenticated users for now)
-- In a production environment, you should restrict these based on project/department membership.

CREATE POLICY "Allow authenticated access to chat_channels" ON public.chat_channels
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated access to chat_channel_members" ON public.chat_channel_members
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated access to messages" ON public.messages
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated access to message_reactions" ON public.message_reactions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated access to message_attachments" ON public.message_attachments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
