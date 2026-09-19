
-- ============================================================
-- DOM MARKETPLACE FOUNDATION
-- Layer 1: services-agency core (leads, clients, mission requests, jobs, deliverables, notes)
-- Layer 2: marketplace (contractors, assignments, SOP docs, payments)
-- RLS enabled on all tables; default-deny (service-role only) until portals come online.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- enums ----------
do $$ begin
  create type lead_status as enum ('new','contacted','qualified','converted','lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mission_status as enum ('requested','reviewing','scoped','quoted','approved','assigned','in_progress','data_review','delivered','closed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum ('scheduled','in_progress','flown','processing','qc','delivered','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contractor_status as enum ('applied','vetting','active','suspended','inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type assignment_status as enum ('offered','accepted','declined','in_progress','submitted','qc_passed','qc_rejected','paid','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending','authorized','captured','paid_out','refunded','failed');
exception when duplicate_object then null; end $$;

-- ---------- LAYER 1: services core ----------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  industry text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  company text,
  phone text,
  source text,
  message text,
  status lead_status not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists mission_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  requester_name text,
  requester_email text,
  company text,
  industry text,
  service_type text,
  location text,
  latitude numeric,
  longitude numeric,
  airspace_class text,
  timeline text,
  scope text,
  budget_range text,
  status mission_status not null default 'requested',
  quoted_amount_cents integer,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  mission_request_id uuid references mission_requests(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  title text not null,
  service_type text,
  location text,
  scheduled_for timestamptz,
  status job_status not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table if not exists deliverables (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  name text not null,
  type text,
  storage_url text,
  qc_passed boolean default false,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,        -- 'lead' | 'client' | 'mission_request' | 'job' | 'contractor'
  entity_id uuid not null,
  author text,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- LAYER 2: marketplace ----------

-- SOP / docs library: the DOM standard (this is the IP)
create table if not exists sop_documents (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  mission_type text,                -- which service this SOP governs
  category text,                    -- 'prep' | 'flight_ops' | 'deliverable_spec' | 'safety' | 'compliance'
  version integer not null default 1,
  is_current boolean not null default true,
  body_md text,                     -- the actual procedure / checklist (markdown)
  required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contractor pilots (1099)
create table if not exists contractors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text unique,
  phone text,
  status contractor_status not null default 'applied',
  part107_number text,
  part107_verified boolean not null default false,
  part107_expires_on date,
  insurance_provider text,
  insurance_policy_no text,
  insurance_verified boolean not null default false,
  insurance_expires_on date,
  service_area text,                -- region / radius they cover
  equipment text,                   -- aircraft / sensors they own
  stripe_connect_account_id text,   -- Stripe Connect (Express/Standard) acct for payouts
  rating numeric(3,2),
  missions_completed integer not null default 0,
  created_at timestamptz not null default now()
);

-- Which contractor is doing which job, and the money split
create table if not exists mission_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  contractor_id uuid references contractors(id) on delete set null,
  status assignment_status not null default 'offered',
  offered_at timestamptz default now(),
  accepted_at timestamptz,
  submitted_at timestamptz,
  -- economics (the commission model)
  mission_price_cents integer,            -- what the client pays
  contractor_payout_cents integer,        -- what the pilot gets
  dom_commission_cents integer,           -- DOM's take (application fee)
  qc_notes text,
  created_at timestamptz not null default now()
);

-- SOP acknowledgement: proof a contractor read the standard before flying (also helps the 1099 framing)
create table if not exists assignment_sops (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references mission_assignments(id) on delete cascade,
  sop_document_id uuid not null references sop_documents(id) on delete cascade,
  acknowledged_at timestamptz,
  unique (assignment_id, sop_document_id)
);

-- Payments via Stripe Connect (platform takes application fee = commission)
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  mission_request_id uuid references mission_requests(id) on delete set null,
  assignment_id uuid references mission_assignments(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  contractor_id uuid references contractors(id) on delete set null,
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  amount_total_cents integer not null,        -- client charge
  application_fee_cents integer,              -- DOM commission
  contractor_amount_cents integer,            -- routed to contractor's connected acct
  currency text not null default 'usd',
  status payment_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- ---------- helpful indexes ----------
create index if not exists idx_mission_requests_status on mission_requests(status);
create index if not exists idx_jobs_status on jobs(status);
create index if not exists idx_assignments_job on mission_assignments(job_id);
create index if not exists idx_assignments_contractor on mission_assignments(contractor_id);
create index if not exists idx_sop_mission_type on sop_documents(mission_type);
create index if not exists idx_payments_status on payments(status);
create index if not exists idx_notes_entity on notes(entity_type, entity_id);

-- ---------- RLS: enable everywhere, default-deny (service-role bypasses RLS) ----------
alter table clients enable row level security;
alter table leads enable row level security;
alter table mission_requests enable row level security;
alter table jobs enable row level security;
alter table deliverables enable row level security;
alter table notes enable row level security;
alter table sop_documents enable row level security;
alter table contractors enable row level security;
alter table mission_assignments enable row level security;
alter table assignment_sops enable row level security;
alter table payments enable row level security;
