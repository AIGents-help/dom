create table if not exists public.admin_messages (
  id uuid primary key default gen_random_uuid(),
  mission_request_id uuid references public.mission_requests(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  source text not null default 'website_mission_request',
  sender_name text not null,
  sender_email text not null,
  sender_phone text,
  company text,
  subject text not null,
  message text,
  service_type text,
  location text,
  status text not null default 'unread' check (status in ('unread', 'read', 'archived')),
  admin_note text,
  read_at timestamptz,
  read_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_request_id, source)
);

create index if not exists admin_messages_status_created_idx
  on public.admin_messages(status, created_at desc);
create index if not exists admin_messages_sender_email_idx
  on public.admin_messages(lower(sender_email));

alter table public.admin_messages enable row level security;

grant select, insert, update, delete on table public.admin_messages to service_role;

-- The browser never reads this table directly. Admin API routes use the
-- service role after verifying the caller against admin_users.

insert into public.admin_messages (
  mission_request_id,
  client_id,
  source,
  sender_name,
  sender_email,
  company,
  subject,
  message,
  service_type,
  location,
  status,
  created_at,
  updated_at
)
select
  mr.id,
  mr.client_id,
  'historical_mission_request',
  coalesce(nullif(mr.requester_name, ''), 'Website visitor'),
  coalesce(nullif(mr.requester_email, ''), 'unknown@invalid.local'),
  mr.company,
  'Mission request — ' || coalesce(nullif(replace(mr.service_type, '_', ' '), ''), 'General inquiry'),
  mr.scope,
  mr.service_type,
  mr.location,
  'read',
  mr.created_at,
  mr.created_at
from public.mission_requests mr
where not exists (
  select 1 from public.admin_messages am where am.mission_request_id = mr.id
);
