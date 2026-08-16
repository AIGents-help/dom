create table if not exists public.mission_support_requests (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid references public.contractors(id) on delete set null,
  assignment_id uuid references public.mission_assignments(id) on delete set null,
  mission_request_id uuid references public.mission_requests(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  category text not null check (category in ('scope','schedule','weather','airspace','equipment','safety','client_access','payment','technical','incident','other')),
  urgency text not null default 'normal' check (urgency in ('normal','urgent','operations_stopped')),
  status text not null default 'open' check (status in ('open','acknowledged','waiting_on_pilot','waiting_on_client','resolved','closed')),
  subject text not null,
  details text not null,
  operations_paused boolean not null default false,
  pilot_location jsonb,
  assigned_admin text,
  resolution text,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mission_support_open_idx on public.mission_support_requests(status,urgency,created_at);
create index if not exists mission_support_pilot_idx on public.mission_support_requests(contractor_id,created_at desc);

alter table public.mission_support_requests enable row level security;
revoke all on public.mission_support_requests from anon,authenticated;

comment on table public.mission_support_requests is 'Server-mediated DOM support and escalation queue. Pilot access is scoped through authenticated route handlers.';
