
-- Campaigns run against Smartlead sending domains
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sending_domain text not null,
  offer_key text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- Reference copy of each sequence step (Smartlead is source of truth for sending; this is audit/reference)
create table campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  step_number int not null,
  day_offset int not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, step_number)
);

-- Companies sourced for outreach, before/regardless of becoming a lead
create table prospects (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  contact_title text,
  email text,
  phone text,
  industry text,
  territory text,
  source text not null default 'smartlead',
  enrichment jsonb not null default '{}'::jsonb,
  status text not null default 'sourced',
  campaign_id uuid references campaigns(id),
  created_at timestamptz not null default now()
);

-- Sent/opened/replied/bounced event log, synced from Smartlead webhooks
create table outreach_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  campaign_id uuid references campaigns(id),
  event_type text not null,
  intent text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_prospects_status on prospects (status);
create index idx_prospects_campaign on prospects (campaign_id);
create index idx_outreach_events_prospect on outreach_events (prospect_id, event_type);

-- Link converted leads back to their originating prospect
alter table leads add column external_prospect_id uuid references prospects(id);

-- RLS: same admin-only pattern as the rest of the schema
alter table campaigns enable row level security;
alter table campaign_steps enable row level security;
alter table prospects enable row level security;
alter table outreach_events enable row level security;

create policy "admins full access" on campaigns for all using (is_admin());
create policy "admins full access" on campaign_steps for all using (is_admin());
create policy "admins full access" on prospects for all using (is_admin());
create policy "admins full access" on outreach_events for all using (is_admin());
