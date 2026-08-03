-- Additive-only migration for the DOM Leads sales-cockpit build: structured
-- next-actions, Smartlead sync state, and webhook idempotency ledger.
--
-- Safety notes:
-- * Every new table is brand new (no existing table is altered here except
--   for adding `updated_at`-maintaining triggers, which touch no data).
-- * `lead_next_actions` is backfilled from the existing `leads.next_action` /
--   `leads.next_follow_up_at` columns, which are left untouched (still read
--   as a fallback by the app when a lead has no structured next-action row
--   yet). The backfill INSERT is guarded by NOT EXISTS, so re-running this
--   file is a safe no-op the second time.
-- * This repo has no `updated_at` convention anywhere yet — `set_updated_at()`
--   below is the first precedent for it, scoped to only the two tables that
--   need it here.

-- Generic updated_at trigger — first precedent for this convention in the repo.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Structured next-action tracking. Supersedes the free-text `leads.next_action`
-- column as the source of truth going forward; that legacy column is kept
-- (not dropped) as a read-only fallback for leads that predate this table.
create table if not exists public.lead_next_actions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  action_type text not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  assigned_to text,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger lead_next_actions_set_updated_at
  before update on public.lead_next_actions
  for each row execute function public.set_updated_at();

create index if not exists idx_lead_next_actions_lead_id on public.lead_next_actions (lead_id);
create index if not exists idx_lead_next_actions_due_at on public.lead_next_actions (due_at);
create index if not exists idx_lead_next_actions_status on public.lead_next_actions (status);
create index if not exists idx_lead_next_actions_status_due_at on public.lead_next_actions (status, due_at);

alter table public.lead_next_actions enable row level security;
-- Same posture as the rest of the lead-adjacent tables (lead_activities,
-- lead_contacts, etc.): the app writes directly from the authenticated
-- browser session, gated only by a client-side redirect-if-no-session check.
-- No RLS policy is versioned anywhere in this repo to copy exactly — this is
-- a best-effort match and should be reviewed against the live policies on
-- sibling tables before being applied.
create policy "authenticated_all_lead_next_actions" on public.lead_next_actions
  for all to authenticated using (true) with check (true);

-- Idempotent backfill: one open next-action row per lead that already has a
-- legacy free-text next_action, so the new table isn't empty on day one.
insert into public.lead_next_actions (lead_id, action_type, due_at, status, notes)
select l.id, 'follow_up', l.next_follow_up_at::timestamptz, 'open', l.next_action
from public.leads l
where l.next_action is not null
  and not exists (
    select 1 from public.lead_next_actions n where n.lead_id = l.id
  );

-- Per-lead Smartlead sync/engagement state. Reuses the existing
-- `leads.smartlead_campaign_id` / `leads.smartlead_lead_id` columns as the
-- identity on the Smartlead side rather than duplicating them here.
create table if not exists public.lead_smartlead_status (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads (id) on delete cascade,
  campaign_name text,
  sequence_step integer,
  outreach_status text,
  last_sent_at timestamptz,
  last_opened_at timestamptz,
  last_clicked_at timestamptz,
  last_replied_at timestamptz,
  reply_category text,
  bounce_status text,
  unsubscribed_at timestamptz,
  open_count integer not null default 0,
  click_count integer not null default 0,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger lead_smartlead_status_set_updated_at
  before update on public.lead_smartlead_status
  for each row execute function public.set_updated_at();

create index if not exists idx_lead_smartlead_status_lead_id on public.lead_smartlead_status (lead_id);
create index if not exists idx_lead_smartlead_status_outreach_status on public.lead_smartlead_status (outreach_status);
create index if not exists idx_lead_smartlead_status_last_replied_at on public.lead_smartlead_status (last_replied_at);

alter table public.lead_smartlead_status enable row level security;
create policy "authenticated_all_lead_smartlead_status" on public.lead_smartlead_status
  for all to authenticated using (true) with check (true);

-- Webhook idempotency ledger, keyed off Smartlead's own `X-Request-Id`
-- delivery header. Written exclusively by the service-role webhook handler
-- (app/api/webhooks/smartlead/route.ts) — the browser client never touches
-- this table, so unlike the two tables above it gets RLS enabled with NO
-- policies (service-role bypasses RLS regardless; a permissive policy here
-- would let any logged-in user read/write an internal ledger of raw lead
-- emails for no functional reason).
create table if not exists public.smartlead_webhook_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  event_type text,
  lead_email text,
  processed_at timestamptz not null default now()
);

create index if not exists idx_smartlead_webhook_events_request_id on public.smartlead_webhook_events (request_id);

alter table public.smartlead_webhook_events enable row level security;
