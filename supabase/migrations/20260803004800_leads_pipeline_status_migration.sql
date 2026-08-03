-- Adds the 10 new pipeline-stage labels to the `lead_status` Postgres enum
-- type. `leads.status` is a real enum (confirmed by live introspection —
-- the original version of this migration incorrectly assumed a plain `text`
-- column with a CHECK constraint; that assumption was wrong and this file
-- replaces it).
--
-- Deliberately does NOT touch any row's data — see the follow-up migration
-- (20260803004850_leads_status_data_remap.sql) for the UPDATE statements
-- that move existing rows onto the new labels. Postgres cannot use a newly
-- added enum value in the same transaction that added it, so the
-- value-adding step and the data-remapping step must be two separate,
-- sequentially-committed migrations — this file is the first of the two.
--
-- Safety notes:
-- * `ADD VALUE IF NOT EXISTS` is idempotent — re-running this file is a
--   no-op the second time.
-- * No existing enum label is touched or removed. `cold`, `quoted`,
--   `scheduled`, `customer` (the 3 legacy labels not already reused by the
--   new vocabulary) remain valid members of the type — Postgres enums
--   cannot have values removed without a full type rebuild, which is out of
--   scope here (see the follow-up migration's header for why that's an
--   acceptable, deliberate tradeoff).
-- * `contacted`, `qualified`, and `lost` already exist in the enum with the
--   exact spelling the new vocabulary also uses, so they need no ADD VALUE
--   here and no remapping in the follow-up migration.

alter type public.lead_status add value if not exists 'new';
alter type public.lead_status add value if not exists 'researching';
alter type public.lead_status add value if not exists 'ready_for_outreach';
alter type public.lead_status add value if not exists 'outreach_scheduled';
alter type public.lead_status add value if not exists 'needs_response';
alter type public.lead_status add value if not exists 'follow_up';
alter type public.lead_status add value if not exists 'proposal';
alter type public.lead_status add value if not exists 'won';
alter type public.lead_status add value if not exists 'no_response';
alter type public.lead_status add value if not exists 'do_not_contact';
