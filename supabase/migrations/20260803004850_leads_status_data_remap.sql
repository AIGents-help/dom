-- Remaps existing `leads.status` rows from the 4 legacy enum labels that
-- don't already match the new pipeline vocabulary onto their new-pipeline
-- equivalent. Must run strictly AFTER 20260803004800 (which adds the target
-- labels to the `lead_status` enum) has been committed — Postgres does not
-- allow a newly added enum value to be used within the same transaction
-- that added it, which is why this is a separate migration file rather than
-- appended to that one.
--
-- Mapping applied (only these 4 rows change; `contacted`, `qualified`, and
-- `lost` already match the new vocabulary's spelling and are left alone):
--   cold       -> new
--   quoted     -> proposal
--   scheduled  -> outreach_scheduled
--   customer   -> won
--
-- Safety notes:
-- * No row is deleted. No column is dropped. Every row keeps its identity;
--   only the `status` value on rows currently holding one of the 4 legacy
--   labels above is rewritten.
-- * Idempotent: after the first run, no row will match any of the 4 legacy
--   labels again, so re-running this file is a safe no-op.
-- * `lead_status` is NOT rebuilt and the 4 legacy labels are not removed
--   from the enum type (Postgres can't drop enum values without a full type
--   rebuild) — they simply become unused going forward. The application
--   (lib/leadsPipeline.ts STATUS_OPTIONS / LEGACY_STATUS_MAP) never writes
--   them after this build, so no DB-level CHECK constraint is needed to
--   enforce that; this is a deliberate, reviewed tradeoff, not an oversight.

update public.leads set status = 'new'                where status = 'cold';
update public.leads set status = 'proposal'            where status = 'quoted';
update public.leads set status = 'outreach_scheduled'  where status = 'scheduled';
update public.leads set status = 'won'                 where status = 'customer';
