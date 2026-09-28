create table if not exists public.dominic_flight_runs (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  mission_request_id uuid null references public.mission_requests(id) on delete set null,
  mapping_project_id uuid null references public.mapping_projects(id) on delete set null,
  mission_type text not null,
  status text not null default 'planned',
  aircraft_vendor text null,
  aircraft_model text null,
  aircraft_id text null,
  bridge_id text null,
  plan jsonb not null default '{}'::jsonb,
  calibration jsonb not null default '{}'::jsonb,
  capability_snapshot jsonb not null default '{}'::jsonb,
  coverage_summary jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  completed_at timestamptz null,
  aborted_at timestamptz null,
  failure_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dominic_flight_runs_contractor_created_idx
  on public.dominic_flight_runs(contractor_id, created_at desc);

create index if not exists dominic_flight_runs_mission_request_idx
  on public.dominic_flight_runs(mission_request_id)
  where mission_request_id is not null;

create table if not exists public.dominic_flight_events (
  id uuid primary key default gen_random_uuid(),
  flight_run_id uuid not null references public.dominic_flight_runs(id) on delete cascade,
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  event_at timestamptz not null default now(),
  phase text not null,
  message text not null,
  checkpoint_id text null,
  aircraft_state jsonb null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dominic_flight_events_run_time_idx
  on public.dominic_flight_events(flight_run_id, event_at);

create table if not exists public.dominic_capture_observations (
  id uuid primary key default gen_random_uuid(),
  flight_run_id uuid not null references public.dominic_flight_runs(id) on delete cascade,
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  checkpoint_id text null,
  captured_at timestamptz not null,
  latitude double precision null,
  longitude double precision null,
  relative_altitude_ft double precision null,
  camera_angle_deg double precision null,
  sharpness_score double precision null,
  exposure_score double precision null,
  usable boolean null,
  image_reference text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dominic_capture_observations_run_checkpoint_idx
  on public.dominic_capture_observations(flight_run_id, checkpoint_id);

alter table public.dominic_flight_runs enable row level security;
alter table public.dominic_flight_events enable row level security;
alter table public.dominic_capture_observations enable row level security;

revoke all on public.dominic_flight_runs from anon, authenticated;
revoke all on public.dominic_flight_events from anon, authenticated;
revoke all on public.dominic_capture_observations from anon, authenticated;

comment on table public.dominic_flight_runs is
  'Pilot-owned DOMINIC flight execution records. Accessed through authenticated pilot APIs using service-role authorization.';

comment on table public.dominic_flight_events is
  'Append-only DOMINIC mission execution event/audit trail for a flight run.';

comment on table public.dominic_capture_observations is
  'DOMINIC capture observations tied to a persisted flight run for adaptive coverage and repair analysis.';
