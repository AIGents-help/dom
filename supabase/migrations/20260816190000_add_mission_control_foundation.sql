-- Shared mission-control foundation for Admin, Pilot, and Client experiences.
alter table public.clients add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists clients_user_id_uidx on public.clients(user_id) where user_id is not null;

alter table public.jobs
  add column if not exists backup_scheduled_for timestamptz,
  add column if not exists checked_in_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists actual_duration_minutes integer,
  add column if not exists sla_due_at timestamptz;

alter table public.quotes
  add column if not exists version_number integer not null default 1,
  add column if not exists supersedes_quote_id uuid references public.quotes(id),
  add column if not exists locked_at timestamptz,
  add column if not exists internal_cost_estimate_cents integer,
  add column if not exists target_margin_bps integer;

alter table public.deliverables
  add column if not exists client_status text not null default 'pending' check (client_status in ('pending','approved','revision_requested')),
  add column if not exists client_feedback text,
  add column if not exists client_reviewed_at timestamptz,
  add column if not exists share_expires_at timestamptz;

create table if not exists public.mission_activity_events (
  id uuid primary key default gen_random_uuid(),
  mission_request_id uuid not null references public.mission_requests(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  assignment_id uuid references public.mission_assignments(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('admin','pilot','client','system')),
  visibility text not null default 'internal' check (visibility in ('internal','pilot','client','shared')),
  event_type text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mission_readiness_items (
  id uuid primary key default gen_random_uuid(),
  mission_request_id uuid not null references public.mission_requests(id) on delete cascade,
  assignment_id uuid references public.mission_assignments(id) on delete cascade,
  key text not null,
  label text not null,
  category text not null,
  required boolean not null default true,
  completed boolean not null default false,
  blocking boolean not null default true,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  notes text,
  sort_order integer not null default 0,
  unique(mission_request_id, assignment_id, key)
);

create table if not exists public.mission_checklist_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.mission_assignments(id) on delete cascade,
  phase text not null check (phase in ('planning','preflight','onsite','flight','postflight','submission','qc')),
  item_key text not null,
  label text not null,
  required boolean not null default true,
  completed boolean not null default false,
  completed_at timestamptz,
  evidence_url text,
  notes text,
  sort_order integer not null default 0,
  unique(assignment_id, phase, item_key)
);

create table if not exists public.mission_cost_entries (
  id uuid primary key default gen_random_uuid(),
  mission_request_id uuid not null references public.mission_requests(id) on delete cascade,
  assignment_id uuid references public.mission_assignments(id) on delete set null,
  category text not null,
  description text,
  estimated_cents integer not null default 0,
  actual_cents integer,
  quantity numeric not null default 1,
  incurred_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.mission_change_orders (
  id uuid primary key default gen_random_uuid(),
  mission_request_id uuid not null references public.mission_requests(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  title text not null,
  reason text not null,
  scope_delta text,
  amount_delta_cents integer not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','approved','rejected','cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  responded_at timestamptz,
  client_response_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.mission_incidents (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.mission_assignments(id) on delete cascade,
  severity text not null check (severity in ('observation','near_miss','minor','major','reportable')),
  occurred_at timestamptz not null,
  summary text not null,
  details text,
  location text,
  injury_or_damage boolean not null default false,
  operations_paused boolean not null default false,
  reported_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now()
);

create table if not exists public.pilot_availability (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  availability_type text not null default 'available' check (availability_type in ('available','unavailable','tentative')),
  notes text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists mission_activity_events_mission_created_idx on public.mission_activity_events(mission_request_id, created_at desc);
create index if not exists mission_readiness_items_mission_idx on public.mission_readiness_items(mission_request_id, completed, blocking);
create index if not exists mission_checklist_items_assignment_idx on public.mission_checklist_items(assignment_id, phase, sort_order);
create index if not exists mission_cost_entries_mission_idx on public.mission_cost_entries(mission_request_id);
create index if not exists mission_change_orders_mission_idx on public.mission_change_orders(mission_request_id, created_at desc);
create index if not exists mission_incidents_assignment_idx on public.mission_incidents(assignment_id, occurred_at desc);
create index if not exists pilot_availability_contractor_time_idx on public.pilot_availability(contractor_id, starts_at, ends_at);

alter table public.mission_activity_events enable row level security;
alter table public.mission_readiness_items enable row level security;
alter table public.mission_checklist_items enable row level security;
alter table public.mission_cost_entries enable row level security;
alter table public.mission_change_orders enable row level security;
alter table public.mission_incidents enable row level security;
alter table public.pilot_availability enable row level security;

create policy "admins manage mission activity" on public.mission_activity_events for all to authenticated using (is_admin()) with check (is_admin());
create policy "admins manage readiness" on public.mission_readiness_items for all to authenticated using (is_admin()) with check (is_admin());
create policy "admins manage checklists" on public.mission_checklist_items for all to authenticated using (is_admin()) with check (is_admin());
create policy "admins manage mission costs" on public.mission_cost_entries for all to authenticated using (is_admin()) with check (is_admin());
create policy "admins manage change orders" on public.mission_change_orders for all to authenticated using (is_admin()) with check (is_admin());
create policy "admins manage incidents" on public.mission_incidents for all to authenticated using (is_admin()) with check (is_admin());
create policy "admins manage pilot availability" on public.pilot_availability for all to authenticated using (is_admin()) with check (is_admin());

create policy "pilots manage assigned checklists" on public.mission_checklist_items for all to authenticated
using (exists (select 1 from public.mission_assignments ma join public.contractors c on c.id=ma.contractor_id where ma.id=assignment_id and c.user_id=(select auth.uid())))
with check (exists (select 1 from public.mission_assignments ma join public.contractors c on c.id=ma.contractor_id where ma.id=assignment_id and c.user_id=(select auth.uid())));
create policy "pilots manage assigned incidents" on public.mission_incidents for all to authenticated
using (exists (select 1 from public.mission_assignments ma join public.contractors c on c.id=ma.contractor_id where ma.id=assignment_id and c.user_id=(select auth.uid())))
with check (exists (select 1 from public.mission_assignments ma join public.contractors c on c.id=ma.contractor_id where ma.id=assignment_id and c.user_id=(select auth.uid())));
create policy "pilots manage own availability" on public.pilot_availability for all to authenticated
using (exists (select 1 from public.contractors c where c.id=contractor_id and c.user_id=(select auth.uid())))
with check (exists (select 1 from public.contractors c where c.id=contractor_id and c.user_id=(select auth.uid())));

create policy "pilots read assigned activity" on public.mission_activity_events for select to authenticated
using (visibility in ('pilot','shared') and exists (select 1 from public.mission_assignments ma join public.contractors c on c.id=ma.contractor_id where ma.id=assignment_id and c.user_id=(select auth.uid())));
create policy "pilots read assigned readiness" on public.mission_readiness_items for select to authenticated
using (exists (select 1 from public.mission_assignments ma join public.contractors c on c.id=ma.contractor_id where ma.id=assignment_id and c.user_id=(select auth.uid())));

create policy "clients read own activity" on public.mission_activity_events for select to authenticated
using (visibility in ('client','shared') and exists (select 1 from public.mission_requests mr join public.clients cl on cl.id=mr.client_id where mr.id=mission_request_id and cl.user_id=(select auth.uid())));
create policy "clients read own change orders" on public.mission_change_orders for select to authenticated
using (exists (select 1 from public.mission_requests mr join public.clients cl on cl.id=mr.client_id where mr.id=mission_request_id and cl.user_id=(select auth.uid())));
