-- Remaps `leads.status` from the original 7-value CRM vocabulary to the new
-- 13-stage sales pipeline, then locks the column down with a CHECK constraint.
--
-- This is the one migration in this batch that rewrites existing data rather
-- than only adding nullable columns — reviewed and isolated on purpose so it
-- can be applied (or held back) independently of the purely additive files
-- that follow it.
--
-- Safety notes:
-- * The UPDATE below only touches rows whose status is EXACTLY one of the 7
--   known legacy values. It is idempotent: after the first run, no row will
--   match any legacy value again, so re-running this file is a safe no-op
--   for the UPDATE (the CHECK constraint below is not re-runnable, matching
--   this repo's existing migration convention of plain `add constraint`).
-- * No row is deleted. No column is dropped. Every row keeps its identity;
--   only the `status` string on rows with a legacy value is rewritten to its
--   documented new-pipeline equivalent below.
-- * If a row somehow already has a value outside both the legacy list and the
--   new 13-value list (shouldn't happen — `status` has never had a DB
--   constraint until this migration), the UPDATE leaves it untouched and the
--   CHECK constraint addition below will fail loudly rather than silently
--   coercing unknown data — surface it for manual review instead of guessing.
--
-- Legacy -> new mapping (reviewed with the app owner before being applied):
--   cold       -> new
--   contacted  -> contacted
--   qualified  -> qualified
--   quoted     -> proposal
--   scheduled  -> outreach_scheduled
--   customer   -> won
--   lost       -> lost

update public.leads set status = 'new'                where status = 'cold';
update public.leads set status = 'proposal'            where status = 'quoted';
update public.leads set status = 'outreach_scheduled'  where status = 'scheduled';
update public.leads set status = 'won'                 where status = 'customer';
-- contacted and lost already match their new-vocabulary spelling; no rewrite needed.

alter table public.leads
  add constraint leads_status_check check (
    status in (
      'new', 'researching', 'ready_for_outreach', 'outreach_scheduled',
      'contacted', 'needs_response', 'follow_up', 'qualified', 'proposal',
      'won', 'no_response', 'lost', 'do_not_contact'
    )
  );
