-- Additive-only: manual priority override on leads, and a back-link from a
-- converted client to its originating lead (for duplicate-conversion checks
-- and preserving lead history through conversion).
--
-- Safety notes:
-- * Both new columns are nullable — no backfill required, no existing row
--   (on either table) is affected.
-- * The computed lead-priority score/label/reasons are intentionally NOT
--   persisted anywhere — they're derived at render time from fields that
--   already exist (industry, engagement/ownership, value, contact
--   completeness, engagement signals, next-action urgency), so there's
--   nothing here to keep in sync. `priority_override` is the only piece a
--   human can actually set, so it's the only piece that needs a column.

alter table public.leads
  add column if not exists priority_override text check (
    priority_override is null or priority_override in ('high', 'medium', 'low')
  );

alter table public.clients
  add column if not exists lead_id uuid references public.leads (id);

create index if not exists idx_clients_lead_id on public.clients (lead_id);
