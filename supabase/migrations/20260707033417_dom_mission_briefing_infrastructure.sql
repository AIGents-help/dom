
-- ============================================================
-- MISSION BRIEFING: the complete operational package
-- Everything a pilot needs to show up and fly.
-- ============================================================

-- Documents: any uploadable file associated with a mission
-- Permits, insurance certs, property access forms, LAANC screenshots,
-- waivers, site photos, client contracts, anything.
create table if not exists mission_documents (
  id uuid primary key default gen_random_uuid(),
  mission_request_id uuid not null references mission_requests(id) on delete cascade,
  category text not null default 'general',
    -- categories: authorization, permit, waiver, insurance, site_access,
    -- client_contract, laanc, notam, safety, equipment, reference, other
  name text not null,
  description text,
  file_url text,                    -- Supabase Storage or external URL
  file_type text,                   -- pdf, jpg, png, docx, etc.
  file_size_bytes integer,
  uploaded_by text,                 -- 'admin' | 'pilot' | contractor name
  is_required boolean not null default false,
  is_completed boolean not null default false,
  printable boolean not null default true,
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

-- Contacts: everyone the pilot might need to reach
-- Client POC, site manager, property owner, ATC, DOM ops, emergency
create table if not exists mission_contacts (
  id uuid primary key default gen_random_uuid(),
  mission_request_id uuid not null references mission_requests(id) on delete cascade,
  role text not null,
    -- roles: client_poc, site_manager, property_owner, atc, dom_ops,
    -- emergency, contractor, observer, utility_contact, other
  name text not null,
  phone text,
  email text,
  company text,
  notes text,
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

-- Expenses: travel, per diem, equipment rental, parking, tolls, etc.
-- Tracks what the pilot incurs beyond the base mission payout
create table if not exists mission_expenses (
  id uuid primary key default gen_random_uuid(),
  mission_request_id uuid not null references mission_requests(id) on delete cascade,
  assignment_id uuid references mission_assignments(id) on delete set null,
  category text not null default 'travel',
    -- categories: travel_mileage, travel_flight, hotel, per_diem,
    -- equipment_rental, parking, tolls, fuel, supplies, other
  description text not null,
  amount_cents integer not null,
  quantity numeric not null default 1,
  total_cents integer not null,     -- amount_cents * quantity
  billable_to_client boolean not null default true,
  reimbursable boolean not null default true,
  receipt_url text,                 -- uploaded receipt
  status text not null default 'planned',
    -- planned, incurred, submitted, approved, reimbursed, denied
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Permissions & clearances: special authorizations required for the mission
-- LAANC, property access, BVLOS waiver, night waiver, TFR exemption, etc.
create table if not exists mission_permissions (
  id uuid primary key default gen_random_uuid(),
  mission_request_id uuid not null references mission_requests(id) on delete cascade,
  permission_type text not null,
    -- types: laanc, property_access, bvlos_waiver, night_waiver,
    -- tfr_exemption, utility_clearance, government_clearance,
    -- faa_coordination, airport_notification, state_permit, local_permit,
    -- client_authorization, insurance_certificate, other
  title text not null,
  description text,
  status text not null default 'required',
    -- required, requested, pending, approved, denied, expired, waived
  authority text,                   -- who grants it (FAA, property owner, etc.)
  reference_number text,            -- authorization number, permit ID
  document_url text,                -- uploaded proof/screenshot
  requested_at timestamptz,
  approved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Extend mission_requests with briefing-level fields
alter table mission_requests
  add column if not exists skyvector_url text,
  add column if not exists site_access_instructions text,
  add column if not exists special_equipment text,
  add column if not exists hazards text,
  add column if not exists notes_for_pilot text,
  add column if not exists scheduled_date date,
  add column if not exists scheduled_time_local text,
  add column if not exists estimated_duration_minutes integer,
  add column if not exists weather_go_nogo text;

-- Indexes
create index if not exists idx_docs_mission on mission_documents(mission_request_id);
create index if not exists idx_docs_category on mission_documents(category);
create index if not exists idx_contacts_mission on mission_contacts(mission_request_id);
create index if not exists idx_expenses_mission on mission_expenses(mission_request_id);
create index if not exists idx_expenses_status on mission_expenses(status);
create index if not exists idx_permissions_mission on mission_permissions(mission_request_id);
create index if not exists idx_permissions_status on mission_permissions(status);

-- RLS
alter table mission_documents enable row level security;
alter table mission_contacts enable row level security;
alter table mission_expenses enable row level security;
alter table mission_permissions enable row level security;

-- Admin full access
do $$
declare t text;
begin
  foreach t in array array['mission_documents','mission_contacts','mission_expenses','mission_permissions']
  loop
    execute format('drop policy if exists "admins full access" on %I;', t);
    execute format(
      'create policy "admins full access" on %I for all to authenticated using (is_admin()) with check (is_admin());', t
    );
  end loop;
end $$;

-- Pilots can read briefing materials for their assigned missions
drop policy if exists "pilots read assigned mission docs" on mission_documents;
create policy "pilots read assigned mission docs"
  on mission_documents for select to authenticated
  using (
    exists (
      select 1 from mission_assignments ma
      join contractors c on c.id = ma.contractor_id
      where ma.job_id = mission_documents.mission_request_id
        and c.email = auth.jwt() ->> 'email'
    )
    or is_admin()
  );

drop policy if exists "pilots read assigned mission contacts" on mission_contacts;
create policy "pilots read assigned mission contacts"
  on mission_contacts for select to authenticated
  using (
    exists (
      select 1 from mission_assignments ma
      join contractors c on c.id = ma.contractor_id
      where ma.job_id = mission_contacts.mission_request_id
        and c.email = auth.jwt() ->> 'email'
    )
    or is_admin()
  );

-- Pilots can create and read their own expenses
drop policy if exists "pilots manage own expenses" on mission_expenses;
create policy "pilots manage own expenses"
  on mission_expenses for all to authenticated
  using (
    exists (
      select 1 from mission_assignments ma
      join contractors c on c.id = ma.contractor_id
      where ma.job_id = mission_expenses.mission_request_id
        and c.email = auth.jwt() ->> 'email'
    )
    or is_admin()
  )
  with check (
    exists (
      select 1 from mission_assignments ma
      join contractors c on c.id = ma.contractor_id
      where ma.job_id = mission_expenses.mission_request_id
        and c.email = auth.jwt() ->> 'email'
    )
    or is_admin()
  );

drop policy if exists "pilots read assigned permissions" on mission_permissions;
create policy "pilots read assigned permissions"
  on mission_permissions for select to authenticated
  using (
    exists (
      select 1 from mission_assignments ma
      join contractors c on c.id = ma.contractor_id
      where ma.job_id = mission_permissions.mission_request_id
        and c.email = auth.jwt() ->> 'email'
    )
    or is_admin()
  );
