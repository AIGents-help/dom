
-- Structured, sortable interaction log per lead — calls, letters, emails, bills,
-- jobs, meetings — distinct from the freeform Notes blob. System actions
-- (status changes, "log contact now") also write here automatically so this
-- becomes the single source of truth for a lead's full history.
create type lead_activity_type as enum (
  'call', 'email', 'letter', 'meeting', 'bill', 'job', 'status_change', 'other'
);

create table lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  activity_type lead_activity_type not null,
  summary text not null,
  amount numeric(10,2),
  occurred_at timestamptz not null default now(),
  created_by text,
  created_at timestamptz not null default now()
);

alter table lead_activities enable row level security;
create policy "admins full access" on lead_activities for all using (is_admin()) with check (is_admin());
create index idx_lead_activities_lead_id on lead_activities(lead_id);
create index idx_lead_activities_occurred_at on lead_activities(occurred_at);
