-- Production already had the legacy admin_messages table before this repository's
-- migration history. A clean disposable database does not, so bootstrap the same
-- server-only inbox surface before consolidating contact_messages into it.
create table if not exists public.admin_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  company text,
  category text not null default 'general_inquiry',
  subject text not null,
  message text not null,
  status text not null default 'unread',
  assigned_admin text,
  admin_notes text,
  read_at timestamptz,
  replied_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_messages drop constraint if exists admin_messages_category_check;
alter table public.admin_messages add constraint admin_messages_category_check check (category in ('general_inquiry','thank_you_feedback','partnership_opportunity','media_inquiry','vendor_inquiry','pilot_question','request_drone_services','website_feedback','billing','other'));
alter table public.admin_messages drop constraint if exists admin_messages_status_check;
alter table public.admin_messages add constraint admin_messages_status_check check (status in ('unread','read','in_progress','replied','closed','archived'));
alter table public.admin_messages add column if not exists replied_at timestamptz;
alter table public.admin_messages add column if not exists closed_at timestamptz;
alter table public.admin_messages enable row level security;
revoke all on public.admin_messages from anon,authenticated;
grant select,insert,update,delete on public.admin_messages to service_role;
drop table if exists public.contact_messages;
