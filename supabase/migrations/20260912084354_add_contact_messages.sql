create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(), name text not null, email text not null, phone text, company text,
  category text not null check (category in ('general_inquiry','partnership','compliment_thank_you','website_feedback','billing','other')),
  subject text not null, message text not null,
  status text not null default 'new' check (status in ('new','read','in_progress','replied','closed','archived')),
  assigned_admin text, admin_notes text, read_at timestamptz, replied_at timestamptz, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists contact_messages_status_created_idx on public.contact_messages(status,created_at desc);
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon,authenticated;
grant select,insert,update,delete on public.contact_messages to service_role;
comment on table public.contact_messages is 'Public non-mission messages routed through server endpoints to the DOM Admin Inbox.';
