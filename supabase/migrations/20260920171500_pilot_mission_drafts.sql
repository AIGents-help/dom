create table if not exists public.pilot_mission_drafts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  client_name text not null,
  client_email text not null,
  client_company text,
  client_phone text,
  location text not null,
  latitude numeric not null,
  longitude numeric not null,
  airspace jsonb,
  travel_origin text,
  distance_miles numeric not null,
  service_type text not null,
  custom_mission_title text,
  custom_mission_scope text,
  custom_deliverables text,
  site_complexity text not null default 'simple',
  urgency text not null default 'standard',
  deliverable_tier text not null default 'standard',
  billing_mode text not null default 'paid' check (billing_mode in ('paid','no_charge')),
  no_charge_reason text,
  quote jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pilot_mission_drafts enable row level security;

create index if not exists pilot_mission_drafts_contractor_updated_idx
  on public.pilot_mission_drafts(contractor_id, updated_at desc);

comment on table public.pilot_mission_drafts is
  'Durable pilot self-service mission drafts saved at Get Quote so refreshes/deploys do not lose mission work.';
