
-- Multiple people per lead/company (branches often have their own estimator,
-- a company may have both an office manager and an estimating inbox, etc.)
create table lead_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  name text,
  email text,
  phone text,
  title text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

-- Multiple physical branches/sites per lead/company
create table lead_locations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  label text not null,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

-- Cross-links between leads (e.g. RailNJ <-> JJD Electric, a parent company
-- and its subsidiary, a GC and a repeat sub-contractor)
create type lead_relationship_type as enum (
  'affiliated', 'parent_company', 'subsidiary', 'vendor', 'partner', 'other'
);

create table lead_relationships (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  related_lead_id uuid not null references leads(id) on delete cascade,
  relationship_type lead_relationship_type not null default 'affiliated',
  notes text,
  created_at timestamptz not null default now(),
  constraint no_self_relationship check (lead_id <> related_lead_id),
  constraint unique_relationship unique (lead_id, related_lead_id)
);

alter table lead_contacts enable row level security;
alter table lead_locations enable row level security;
alter table lead_relationships enable row level security;

create policy "admins full access" on lead_contacts for all using (is_admin()) with check (is_admin());
create policy "admins full access" on lead_locations for all using (is_admin()) with check (is_admin());
create policy "admins full access" on lead_relationships for all using (is_admin()) with check (is_admin());

create index idx_lead_contacts_lead_id on lead_contacts(lead_id);
create index idx_lead_locations_lead_id on lead_locations(lead_id);
create index idx_lead_relationships_lead_id on lead_relationships(lead_id);
create index idx_lead_relationships_related_lead_id on lead_relationships(related_lead_id);
