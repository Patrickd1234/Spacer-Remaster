<USER_REQUEST>
just in case let me share the latest database -- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.users (
  id uuid NOT NULL,
  organization_id uuid,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  auth_provider text NOT NULL DEFAULT 'email'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  search_vector tsvector DEFAULT to_tsvector('english'::regconfig, ((COALESCE(name, ''::text) || ' '::text) || COALESCE(email, ''::text))),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.team_spaces (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT team_spaces_pkey PRIMARY KEY (id),
  CONSTRAINT team_spaces_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.memberships (
  user_id uuid NOT NULL,
  team_space_id uuid,
  role USER-DEFINED NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  id uuid DEFAULT gen_random_uuid(),
  CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT memberships_team_space_id_fkey FOREIGN KEY (team_space_id) REFERENCES public.team_spaces(id)
);
CREATE TABLE public.project_spaces (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_space_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) > 0),
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'archived'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  search_vector tsvector DEFAULT to_tsvector('english'::regconfig, COALESCE(name, ''::text)),
  CONSTRAINT project_spaces_pkey PRIMARY KEY (id),
  CONSTRAINT project_spaces_team_space_id_fkey FOREIGN KEY (team_space_id) REFERENCES public.team_spaces(id)
);
CREATE TABLE public.milestones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) > 0),
  target_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT milestones_pkey PRIMARY KEY (id),
  CONSTRAINT milestones_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project_spaces(id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid,
  milestone_id uuid,
  title text NOT NULL CHECK (char_length(title) > 0),
  description text,
  status text NOT NULL DEFAULT 'todo'::text CHECK (status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text])),
  priority text CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])),
  due_date date,
  assignee_id uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  parent_task_id uuid,
  search_vector tsvector DEFAULT (setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)), 'B'::"char")),
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project_spaces(id),
  CONSTRAINT tasks_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.milestones(id),
  CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id),
  CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.tasks(id)
);
CREATE TABLE public.comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  author_id uuid,
  body text NOT NULL CHECK (char_length(body) > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT comments_pkey PRIMARY KEY (id),
  CONSTRAINT comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id)
);
CREATE TABLE public.attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['file'::text, 'link'::text])),
  url text NOT NULL,
  label text CHECK (label = ANY (ARRAY['document'::text, 'meeting'::text, 'other'::text])),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT attachments_pkey PRIMARY KEY (id),
  CONSTRAINT attachments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id),
  CONSTRAINT attachments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  author_id uuid,
  title text NOT NULL CHECK (char_length(title) > 0),
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT announcements_pkey PRIMARY KEY (id),
  CONSTRAINT announcements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id)
);
CREATE TABLE public.calendar_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) > 0),
  description text,
  event_date date NOT NULL,
  external_url text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_pkey PRIMARY KEY (id),
  CONSTRAINT calendar_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT calendar_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.org_feed_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  team_space_id uuid,
  actor_id uuid,
  headline text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT org_feed_items_pkey PRIMARY KEY (id),
  CONSTRAINT org_feed_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT org_feed_items_team_space_id_fkey FOREIGN KEY (team_space_id) REFERENCES public.team_spaces(id),
  CONSTRAINT org_feed_items_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['assignment'::text, 'mention'::text, 'status_change'::text])),
  reference_type text NOT NULL CHECK (reference_type = ANY (ARRAY['task'::text, 'comment'::text, 'announcement'::text])),
  reference_id uuid NOT NULL,
  body text NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  prior_state jsonb,
  new_state jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT activity_log_pkey PRIMARY KEY (id),
  CONSTRAINT activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id)
);
CREATE TABLE public.team_space_stats (
  team_space_id uuid NOT NULL,
  open_tasks integer NOT NULL DEFAULT 0,
  in_progress integer NOT NULL DEFAULT 0,
  done_tasks integer NOT NULL DEFAULT 0,
  active_projects integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT team_space_stats_pkey PRIMARY KEY (team_space_id),
  CONSTRAINT team_space_stats_team_space_id_fkey FOREIGN KEY (team_space_id) REFERENCES public.team_spaces(id)
);
CREATE TABLE public.invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  team_space_id uuid,
  email text NOT NULL,
  role USER-DEFINED NOT NULL,
  invited_by uuid,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT invites_pkey PRIMARY KEY (id),
  CONSTRAINT invites_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT invites_team_space_id_fkey FOREIGN KEY (team_space_id) REFERENCES public.team_spaces(id),
  CONSTRAINT invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id)
);
CREATE TABLE public.project_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  name text NOT NULL,
  type text,
  size bigint,
  path text NOT NULL,
  url text,
  created_at timestamp with time zone DEFAULT now(),
  uploaded_by text,
  CONSTRAINT project_files_pkey PRIMARY KEY (id),
  CONSTRAINT project_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project_spaces(id)
);
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-07-20T11:42:07+01:00.

The user's current state is as follows:
Active Document: c:\Spacers-Great\Spacer-app\src\project_page.jsx (LANGUAGE_JAVASCRIPT)
Cursor is on line: 799
Other open documents:
- c:\Spacers-Great\Spacer-app\src\project_page.jsx (LANGUAGE_JAVASCRIPT)
- c:\Spacers-Great\Spacer-app\src\Reports.jsx (LANGUAGE_JAVASCRIPT)
- c:\Spacers-Great\Spacer-app\src\home.jsx (LANGUAGE_JAVASCRIPT)
- c:\Spacers-Great\Spacer-app\src\App.jsx (LANGUAGE_JAVASCRIPT)
Browser State:
  Page 7C7D6023BFE0730E5C0037E9494957AF (Spacers | Dashboard) - http://localhost:5173/project_page/235cb0aa-379f-48fb-82bf-5d87f1f4592b [ACTIVE]
    Viewport: 1536x730, Page Height: 793
</ADDITIONAL_METADATA>